import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import crypto from "node:crypto";

const PORT = process.env.PORT || 4173;
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const AUDIT_FILE = path.join(DATA_DIR, "verification-audit.jsonl");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const OFFICIAL_SEARCH_ENDPOINTS = [
  "https://www.gov.cn/sousuo/search.shtml?t=zhengce&q=",
  "https://www.stats.gov.cn/sousuo.htm?q=",
  "https://www.ndrc.gov.cn/search?query=",
  "https://www.miit.gov.cn/search?q="
];

const DIRECT_OFFICIAL_PORTALS = [
  { title: "中国政府网", url: "https://www.gov.cn" },
  { title: "国家统计局", url: "https://www.stats.gov.cn" },
  { title: "国家发展改革委", url: "https://www.ndrc.gov.cn" },
  { title: "工业和信息化部", url: "https://www.miit.gov.cn" }
];

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": MIME[".json"] });
  res.end(JSON.stringify(data));
}

function normalizeDomain(inputUrl) {
  try {
    return new URL(inputUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isOfficialDomain(hostname) {
  return Boolean(hostname && (hostname === "gov.cn" || hostname.endsWith(".gov.cn") || hostname === "stats.gov.cn"));
}

function extractFirst(pattern, text, fallback = "") {
  const match = text.match(pattern);
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : fallback;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function fetchTextWithRetry(targetUrl, retry = 2) {
  let lastError = null;
  for (let i = 0; i <= retry; i += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ReportBot/1.1)",
          Accept: "text/html,application/xhtml+xml"
        }
      });
      clearTimeout(timer);
      const text = await response.text();
      return { ok: response.ok, status: response.status, finalUrl: response.url, text };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("fetch failed");
}

function extractCandidatesFromHtml(html) {
  const links = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let m;
  while ((m = regex.exec(html)) && links.length < 40) {
    const href = m[1];
    const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!href || !title || !href.startsWith("http")) continue;
    links.push({ href, title });
  }
  return links;
}

async function collectOfficialData(region, industry) {
  const query = encodeURIComponent(`${region} ${industry} 招商 产业 政策 政府工作报告`);
  const collected = [];

  for (const endpoint of OFFICIAL_SEARCH_ENDPOINTS) {
    try {
      const { ok, text } = await fetchTextWithRetry(`${endpoint}${query}`);
      if (!ok) continue;
      const candidates = extractCandidatesFromHtml(text)
        .map((v) => ({ ...v, domain: normalizeDomain(v.href) }))
        .filter((v) => isOfficialDomain(v.domain));

      for (const item of candidates.slice(0, 8)) {
        collected.push({ title: item.title, url: item.href, domain: item.domain, source: endpoint });
      }
    } catch {
      // ignore endpoint errors
    }
  }

  if (collected.length === 0) {
    DIRECT_OFFICIAL_PORTALS.forEach((item) => {
      collected.push({ ...item, domain: normalizeDomain(item.url), source: "fallback" });
    });
  }

  const unique = [];
  const seen = new Set();
  collected.forEach((item) => {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      unique.push(item);
    }
  });
  return unique.slice(0, 20);
}

function valueMatchConfidence(text, expectedValues = []) {
  const compact = text.replace(/\s+/g, "");
  const matched = expectedValues.filter((val) => val && compact.includes(String(val).replace(/\s+/g, "")));
  return { matchedCount: matched.length, total: expectedValues.length, matched };
}

async function verifySource(entry) {
  const url = typeof entry === "string" ? entry : entry.url;
  const metric = typeof entry === "string" ? "" : entry.metric || "";
  const expectedValues = typeof entry === "string" ? [] : (entry.expectedValues || []).map(String);

  const hostname = normalizeDomain(url);
  const officialDomain = isOfficialDomain(hostname);
  const result = {
    url,
    metric,
    hostname,
    officialDomain,
    accessible: false,
    status: 0,
    title: "",
    publishDate: "",
    checksum: "",
    matchedValues: [],
    score: 0,
    verdict: "未通过",
    reason: []
  };

  if (!officialDomain) result.reason.push("域名不是官方政府域名（*.gov.cn）");

  try {
    const { ok, status, text, finalUrl } = await fetchTextWithRetry(url);
    result.url = finalUrl;
    result.accessible = ok;
    result.status = status;
    result.title = extractFirst(/<title[^>]*>([\s\S]*?)<\/title>/i, text, "未提取到标题");
    result.publishDate = extractFirst(/(20\d{2}[-年\/.]\d{1,2}[-月\/.]\d{1,2})/i, text, "未提取到发布日期");
    result.checksum = crypto.createHash("sha256").update(text.slice(0, 250000)).digest("hex");

    const match = valueMatchConfidence(text, expectedValues);
    result.matchedValues = match.matched;
    if (match.matchedCount > 0) result.reason.push(`命中关键数值 ${match.matchedCount}/${match.total}`);
    if (ok) result.reason.push("页面可访问");
    if (result.title !== "未提取到标题") result.reason.push("可提取标题");
    if (result.publishDate !== "未提取到发布日期") result.reason.push("可提取日期");

    let score = 0;
    if (officialDomain) score += 35;
    if (ok) score += 20;
    if (result.title !== "未提取到标题") score += 15;
    if (result.publishDate !== "未提取到发布日期") score += 15;
    if (match.matchedCount > 0) score += 15;
    result.score = score;
    result.verdict = score >= 70 ? "通过" : "风险";
  } catch {
    result.reason.push("页面不可访问或抓取失败");
  }

  return result;
}

function appendAudit(record) {
  const line = `${JSON.stringify(record)}\n`;
  fs.appendFileSync(AUDIT_FILE, line, "utf8");
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);

  if (parsed.pathname === "/api/collect-official-data") {
    const region = parsed.searchParams.get("region") || "";
    const industry = parsed.searchParams.get("industry") || "";
    if (!region || !industry) return sendJson(res, 400, { error: "region 和 industry 必填" });
    const items = await collectOfficialData(region, industry);
    return sendJson(res, 200, { count: items.length, items });
  }

  if (parsed.pathname === "/api/verify-sources" && req.method === "POST") {
    const body = await readBody(req);
    const entries = Array.isArray(body.entries) ? body.entries.slice(0, 40) : [];
    if (entries.length === 0) return sendJson(res, 400, { error: "entries 不能为空" });

    const results = [];
    for (const entry of entries) {
      results.push(await verifySource(entry));
    }
    const passCount = results.filter((r) => r.verdict === "通过").length;
    const audit = {
      ts: new Date().toISOString(),
      total: results.length,
      passCount,
      entries,
      results
    };
    appendAudit(audit);
    return sendJson(res, 200, { total: results.length, passCount, results, auditFile: "data/verification-audit.jsonl" });
  }

  if (parsed.pathname === "/api/verify-sources" && req.method === "GET") {
    const urls = parsed.searchParams.getAll("url").filter(Boolean);
    const entries = urls.map((url) => ({ url, metric: "", expectedValues: [] }));
    if (!entries.length) return sendJson(res, 400, { error: "至少提供一个 url" });
    const results = [];
    for (const entry of entries.slice(0, 40)) results.push(await verifySource(entry));
    const passCount = results.filter((r) => r.verdict === "通过").length;
    return sendJson(res, 200, { total: results.length, passCount, results });
  }

  let filePath = parsed.pathname === "/" ? "/index.html" : parsed.pathname;
  filePath = path.join(ROOT, filePath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not Found");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
