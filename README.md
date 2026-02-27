# 多角色文本转语音 Web 应用

上传 `txt / epub / mobi` 文本文件，自动：

1. 解析文本
2. 识别角色并分配不同音色
3. 调用讯飞 WebSocket 语音合成接口
4. 输出 MP3 分片（每片不超过约 30 分钟）
5. 大文件自动分片，且新分片前 30 秒与上一片最后 30 秒重叠

## 快速启动

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env 填入你的密钥
python app.py
```

打开 `http://localhost:8000`。

## 格式说明

- `TXT`: 直接解析
- `EPUB`: 抽取正文 HTML
- `MOBI`: 使用 `mobi` 库抽取正文再解析

## 角色音色识别策略

- 行首匹配 `角色名：对白` 时，角色名作为 speaker
- 引号 `“...”` 文本默认按“角色”处理
- 其余内容归入“旁白”

## 切片策略

- 单片目标时长：30 分钟（通过 5 字/秒估算）
- 相邻切片重叠：30 秒（按尾部对白累计秒数回溯）

## 注意

- 不同 TTS 服务的 WebSocket 参数字段可能略有差异，如遇报错请按控制台日志微调 `XFWebsocketTTS.synthesize()` 的 payload。
