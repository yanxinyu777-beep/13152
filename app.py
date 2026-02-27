import base64
import datetime
import hashlib
import hmac
import json
import os
import re
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List
from urllib.parse import urlencode, urlparse

import websocket
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from ebooklib import ITEM_DOCUMENT, epub
from flask import Flask, jsonify, render_template, request, send_file

try:
    from mobi import Mobi
except Exception:  # optional dependency fallback
    Mobi = None

load_dotenv()

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

MAX_MINUTES = 30
OVERLAP_SECONDS = 30
CHARS_PER_SECOND = 5
MAX_SECONDS = MAX_MINUTES * 60

VOICE_POOL = [
    "xiaoyan",
    "aisjiuxu",
    "x4_guanshan",
    "x4_qianxue",
    "x4_qianmiao",
    "x4_qianxuan",
]


@dataclass
class Utterance:
    speaker: str
    text: str

    @property
    def est_seconds(self) -> int:
        return max(1, len(self.text) // CHARS_PER_SECOND)


class TextExtractor:
    @staticmethod
    def extract(path: Path) -> str:
        suffix = path.suffix.lower()
        if suffix == ".txt":
            return path.read_text(encoding="utf-8", errors="ignore")
        if suffix == ".epub":
            return TextExtractor._extract_epub(path)
        if suffix == ".mobi":
            return TextExtractor._extract_mobi(path)
        raise ValueError("仅支持 txt / epub / mobi 格式。")

    @staticmethod
    def _extract_epub(path: Path) -> str:
        book = epub.read_epub(str(path))
        chunks: List[str] = []
        for item in book.get_items():
            if item.get_type() == ITEM_DOCUMENT:
                soup = BeautifulSoup(item.get_body_content(), "html.parser")
                chunks.append(soup.get_text("\n", strip=True))
        return "\n".join(chunks)

    @staticmethod
    def _extract_mobi(path: Path) -> str:
        if Mobi is None:
            raise ValueError("MOBI 解析依赖未安装，请执行 pip install mobi。")

        mobi_file = Mobi(str(path))
        mobi_file.parse()
        text = mobi_file.book_html.decode("utf-8", errors="ignore")
        soup = BeautifulSoup(text, "html.parser")
        parsed = soup.get_text("\n", strip=True)
        if not parsed:
            raise ValueError("MOBI 解析结果为空，请检查文件内容。")
        return parsed


class RoleAnalyzer:
    ROLE_PREFIX_RE = re.compile(r"^([\u4e00-\u9fa5A-Za-z0-9_]{1,16})[：:](.+)$")

    @staticmethod
    def split_utterances(text: str) -> List[Utterance]:
        utterances: List[Utterance] = []
        current_speaker = "旁白"

        for line in (ln.strip() for ln in text.splitlines()):
            if not line:
                continue

            m = RoleAnalyzer.ROLE_PREFIX_RE.match(line)
            if m:
                current_speaker = m.group(1)
                content = m.group(2).strip()
                if content:
                    utterances.append(Utterance(current_speaker, content))
                continue

            quotes = re.findall(r"“([^”]{2,160})”", line)
            if quotes:
                utterances.extend(Utterance("角色", q.strip()) for q in quotes if q.strip())
            else:
                utterances.append(Utterance(current_speaker, line))

        return utterances

    @staticmethod
    def assign_voices(utterances: Iterable[Utterance]) -> Dict[str, str]:
        speakers: List[str] = []
        for u in utterances:
            if u.speaker not in speakers:
                speakers.append(u.speaker)
        return {speaker: VOICE_POOL[idx % len(VOICE_POOL)] for idx, speaker in enumerate(speakers)}


class Chunker:
    @staticmethod
    def build_chunks(utterances: List[Utterance]) -> List[List[Utterance]]:
        chunks: List[List[Utterance]] = []
        current: List[Utterance] = []
        current_seconds = 0

        for utt in utterances:
            if current and current_seconds + utt.est_seconds > MAX_SECONDS:
                chunks.append(current)
                overlap = Chunker._tail_overlap(current, OVERLAP_SECONDS)
                current = overlap
                current_seconds = sum(u.est_seconds for u in current)

            current.append(utt)
            current_seconds += utt.est_seconds

        if current:
            chunks.append(current)

        return chunks

    @staticmethod
    def _tail_overlap(chunk: List[Utterance], overlap_seconds: int) -> List[Utterance]:
        overlap: List[Utterance] = []
        total = 0
        for utt in reversed(chunk):
            overlap.append(utt)
            total += utt.est_seconds
            if total >= overlap_seconds:
                break
        overlap.reverse()
        return overlap


class XFWebsocketTTS:
    def __init__(self):
        self.api_key = os.getenv("XF_API_KEY", "")
        self.api_secret = os.getenv("XF_API_SECRET", "")
        self.webapi = os.getenv("XF_WEBAPI", "")
        self.app_id = os.getenv("XF_APP_ID", "")

        if not (self.api_key and self.api_secret and self.webapi):
            raise ValueError("请配置 XF_API_KEY / XF_API_SECRET / XF_WEBAPI 环境变量")

    def _auth_url(self) -> str:
        parsed = urlparse(self.webapi)
        host = parsed.netloc
        path = parsed.path
        date = datetime.datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")

        signing_text = f"host: {host}\ndate: {date}\nGET {path} HTTP/1.1"
        digest = hmac.new(self.api_secret.encode(), signing_text.encode(), hashlib.sha256).digest()
        signature = base64.b64encode(digest).decode()

        auth_text = (
            f'api_key="{self.api_key}", algorithm="hmac-sha256", '
            f'headers="host date request-line", signature="{signature}"'
        )
        authorization = base64.b64encode(auth_text.encode()).decode()

        return f"{self.webapi}?{urlencode({'authorization': authorization, 'date': date, 'host': host})}"

    def synthesize(self, text: str, voice: str) -> bytes:
        ws = websocket.create_connection(self._auth_url(), timeout=60)
        payload = {
            "header": {"app_id": self.app_id},
            "parameter": {
                "oral": {
                    "voice_name": voice,
                    "speed": 50,
                    "pitch": 50,
                    "volume": 50,
                    "audio": {"encoding": "mp3", "sample_rate": 16000},
                }
            },
            "payload": {
                "text": {
                    "encoding": "utf8",
                    "status": 2,
                    "text": base64.b64encode(text.encode("utf-8")).decode("utf-8"),
                }
            },
        }

        ws.send(json.dumps(payload, ensure_ascii=False))
        chunks: List[bytes] = []

        while True:
            response = json.loads(ws.recv())
            header = response.get("header", {})
            if header.get("code", 0) != 0:
                ws.close()
                raise RuntimeError(f"TTS 调用失败: {header.get('message', 'unknown error')}")

            audio = response.get("payload", {}).get("audio", {})
            if audio.get("audio"):
                chunks.append(base64.b64decode(audio["audio"]))

            if audio.get("status") == 2:
                break

        ws.close()
        if not chunks:
            raise RuntimeError("TTS 返回为空音频")
        return b"".join(chunks)


class AudioBuilder:
    def __init__(self, out_dir: Path):
        self.out_dir = out_dir
        self.tts = XFWebsocketTTS()

    def build(self, chunks: List[List[Utterance]], voice_map: Dict[str, str], prefix: str) -> List[Path]:
        files: List[Path] = []
        for idx, chunk in enumerate(chunks, start=1):
            out_file = self.out_dir / f"{prefix}_part_{idx:03d}.mp3"
            audio_bytes = bytearray()

            for utt in chunk:
                voice = voice_map.get(utt.speaker, VOICE_POOL[0])
                text = f"{utt.speaker}：{utt.text}"
                audio_bytes.extend(self.tts.synthesize(text, voice))

            out_file.write_bytes(bytes(audio_bytes))
            files.append(out_file)

        return files


app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/process")
def process_file():
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "请上传文件"}), 400

    ext = Path(uploaded.filename).suffix.lower()
    if ext not in {".txt", ".epub", ".mobi"}:
        return jsonify({"error": "仅支持 txt/epub/mobi"}), 400

    task_id = uuid.uuid4().hex[:10]
    input_path = UPLOAD_DIR / f"{task_id}{ext}"
    uploaded.save(input_path)

    try:
        text = TextExtractor.extract(input_path)
        utterances = RoleAnalyzer.split_utterances(text)
        if not utterances:
            return jsonify({"error": "文本解析后为空"}), 400

        voice_map = RoleAnalyzer.assign_voices(utterances)
        chunks = Chunker.build_chunks(utterances)

        job_dir = OUTPUT_DIR / task_id
        job_dir.mkdir(exist_ok=True)
        mp3_files = AudioBuilder(job_dir).build(chunks, voice_map, task_id)

        zip_path = OUTPUT_DIR / f"{task_id}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in mp3_files:
                zf.write(p, p.name)

        return jsonify({
            "task_id": task_id,
            "parts": [p.name for p in mp3_files],
            "voice_map": voice_map,
            "download": f"/api/download/{task_id}",
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.get("/api/download/<task_id>")
def download(task_id: str):
    zip_path = OUTPUT_DIR / f"{task_id}.zip"
    if not zip_path.exists():
        return jsonify({"error": "文件不存在"}), 404
    return send_file(zip_path, as_attachment=True, download_name=f"{task_id}.zip")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
