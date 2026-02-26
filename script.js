const macroBody = document.getElementById("macroBody");
const form = document.getElementById("reportForm");
const startBtn = document.getElementById("startBtn");
const collectBtn = document.getElementById("collectBtn");
const verifyBtn = document.getElementById("verifyBtn");
const progressList = document.getElementById("progressList");
const progressStatus = document.getElementById("progressStatus");
const regionPreview = document.getElementById("regionPreview");
const industryPreview = document.getElementById("industryPreview");
const downloadRegionBtn = document.getElementById("downloadRegionBtn");
const downloadIndustryBtn = document.getElementById("downloadIndustryBtn");
const collectStatus = document.getElementById("collectStatus");
const verifyStatus = document.getElementById("verifyStatus");
const collectList = document.getElementById("collectList");
const verifyList = document.getElementById("verifyList");
const sourcesInput = document.getElementById("sources");

const steps = ["要求分析中", "信息收集中", "信息处理中", "报告撰写中", "整理输出中"];
const years = [2022, 2023, 2024];
let reportState = null;
let gdpChart = null;
let enterpriseChart = null;
let collectedItems = [];
let verifyResults = [];
let verifyRunAt = "";

years.forEach((year) => {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${year}</td>
    <td><input data-y="${year}" data-k="p1" type="number" min="0" step="0.01" required /></td>
    <td><input data-y="${year}" data-k="p2" type="number" min="0" step="0.01" required /></td>
    <td><input data-y="${year}" data-k="p3" type="number" min="0" step="0.01" required /></td>
    <td><input data-y="${year}" data-k="hte" type="number" min="0" required /></td>
    <td><input data-y="${year}" data-k="gazelle" type="number" min="0" required /></td>
  `;
  macroBody.appendChild(tr);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runProgress() {
  const lis = [...progressList.querySelectorAll("li")];
  for (let i = 0; i < steps.length; i += 1) {
    lis.forEach((li, idx) => {
      li.classList.remove("active", "done");
      if (idx < i) li.classList.add("done");
      if (idx === i) li.classList.add("active");
    });
    progressStatus.textContent = steps[i];
    await sleep(850);
  }
  lis.forEach((li) => {
    li.classList.remove("active");
    li.classList.add("done");
  });
  progressStatus.textContent = "报告已生成，可预览和下载。";
}

function parseLines(text) {
  return text
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

function readMacroData() {
  return years.map((year) => {
    const row = {};
    ["p1", "p2", "p3", "hte", "gazelle"].forEach((k) => {
      const el = document.querySelector(`input[data-y='${year}'][data-k='${k}']`);
      row[k] = Number(el.value || 0);
    });
    return { year, ...row };
  });
}

function parseCompanies(raw) {
  return parseLines(raw).map((line) => {
    const [name, industry, product, output, branches] = line.split("|").map((v) => (v || "").trim());
    return {
      name: name || "未披露",
      industry: industry || "未披露",
      product: product || "未披露",
      output: output || "无公开数据",
      branches: branches || "无公开数据"
    };
  });
}

function parseVerification(raw) {
  return parseLines(raw).map((line) => {
    const [metric, v1, v2, v3, s1, s2, s3] = line.split("|").map((v) => (v || "").trim());
    return { metric, v1: Number(v1), v2: Number(v2), v3: Number(v3), s1, s2, s3 };
  });
}

function validateVerification(items) {
  if (items.length === 0) return { ok: false, msg: "请至少填写1条三重校验项。", details: [] };

  const details = items.map((item) => {
    const values = [item.v1, item.v2, item.v3];
    const validNumbers = values.every((v) => Number.isFinite(v));
    const sourcesOk = item.s1 && item.s2 && item.s3;
    if (!item.metric || !validNumbers || !sourcesOk) {
      return { ...item, pass: false, reason: "字段不完整或数值非法" };
    }
    const max = Math.max(...values);
    const min = Math.min(...values);
    const mean = (item.v1 + item.v2 + item.v3) / 3;
    const deviation = mean === 0 ? 0 : ((max - min) / mean) * 100;
    const pass = deviation <= 5;
    return { ...item, pass, reason: pass ? "通过" : `偏差 ${deviation.toFixed(2)}% > 5%` };
  });

  const failed = details.filter((d) => !d.pass);
  if (failed.length > 0) {
    return {
      ok: false,
      msg: `三重校验未通过：${failed.map((f) => `${f.metric}(${f.reason})`).join("；")}`,
      details
    };
  }
  return { ok: true, msg: "三重校验通过", details };
}

function redNumber(text) {
  return text.replace(/(\d+(?:\.\d+)?(?:%|亿元|家))/g, '<span class="num">$1</span>');
}

function markHighlight(text) {
  return text.replace(/~~([^~]+)~~/g, '<span class="hl">$1</span>');
}

function buildFootnotes(sources) {
  return sources.map((s, idx) => `[${idx + 1}] ${s}`).join("\n");
}

function buildRegionReport(data) {
  const latest = data.macro[data.macro.length - 1];
  const total = latest.p1 + latest.p2 + latest.p3;
  const p1 = total ? ((latest.p1 / total) * 100).toFixed(2) : "0.00";
  const p2 = total ? ((latest.p2 / total) * 100).toFixed(2) : "0.00";
  const p3 = total ? ((latest.p3 / total) * 100).toFixed(2) : "0.00";

  const policyText = data.policies.length ? data.policies.map((x) => `- ${x}`).join("\n") : "无公开数据";
  const leaderText = data.leaders.length ? data.leaders.map((x) => `- ${x}`).join("\n") : "无公开数据";
  const companyText = data.companies.length
    ? data.companies
        .map((c, idx) => `${idx + 1}. ${c.name}（${c.industry}）｜产品：${c.product}｜产值：${c.output}亿元｜分公司：${c.branches}`)
        .join("\n")
    : "无公开数据";

  const verifyText = data.verify.details
    .map((v, idx) => `${idx + 1}. ${v.metric}: ${v.v1}/${v.v2}/${v.v3}（${v.reason}）`)
    .join("\n");

  const authText = data.authSummary || "未执行来源真实性核验。";

  return `【宏观结论】
~~${data.targetRegion}具备中高水平招商竞争力，科技要素集聚度较高，但产业链协同与高端人才供给仍需强化。~~

【近3年宏观经济】
以${latest.year}年为例，第一产业${latest.p1}亿元（占比${p1}%）、第二产业${latest.p2}亿元（占比${p2}%）、第三产业${latest.p3}亿元（占比${p3}%）。高新技术企业${latest.hte}家、瞪羚企业${latest.gazelle}家。

【区域调研重点】
${data.regionFocus || "无公开数据"}

【政策与领导导向】
政策摘要：
${policyText}
领导与讲话：
${leaderText}

【支柱产业与代表企业】
${companyText}

【优势与劣势】
优势：产业基础较完整、政策支持方向明确、创新主体较活跃。
劣势：部分关键环节存在外部依赖，创新资源区域分布不均。

【数据三重校验】
${verifyText}

【来源真实性核验】
${authText}

【数据缺失声明】
本报告凡未能检索到公开数据处，统一标注“无公开数据”。

【关键来源】
${buildFootnotes(data.sources)}`;
}

function buildIndustryReport(data) {
  const latest = data.macro[data.macro.length - 1];
  const companyCount = data.companies.length;
  const upstream = data.companies.slice(0, Math.max(1, Math.floor(companyCount / 3))).map((c) => c.name).join("、") || "无公开数据";
  const midstream = data.companies.slice(Math.floor(companyCount / 3), Math.floor((companyCount * 2) / 3)).map((c) => c.name).join("、") || "无公开数据";
  const downstream = data.companies.slice(Math.floor((companyCount * 2) / 3)).map((c) => c.name).join("、") || "无公开数据";

  return `【宏观结论】
~~${data.targetRegion}的${data.targetIndustry}产业具备区域竞争力，未来趋势为“数字化+高端化+绿色化”。~~

【产业介绍】
当前区域创新主体中，高新技术企业约${latest.hte}家，瞪羚企业约${latest.gazelle}家，显示产业创新活跃度较高。建议持续跟踪近三年产值、投资与就业规模变化。

【产业政策】
${data.policies.length ? data.policies.map((x) => `- ${x}`).join("\n") : "无公开数据"}

【区域优势】
产业载体（园区/孵化器）、人才供给、应用场景和政策兑现效率共同形成区域优势；其中科技创新支持是核心变量。

【上下游产业链】
上游：${upstream}
中游：${midstream}
下游：${downstream}

【本地代表企业】
${data.companies.length ? data.companies.map((c, i) => `${i + 1}. ${c.name}（${c.industry}）`).join("\n") : "无公开数据"}

【产业挑战】
技术迭代速度快、同质化竞争、关键环节“卡点”、国际市场波动，是当前主要挑战。

【行业重点关注】
${data.industryFocus || "无公开数据"}

【三重校验结论】
${data.verify.msg}

【来源真实性核验】
${data.authSummary || "未执行来源真实性核验。"}

【关键来源】
${buildFootnotes(data.sources)}`;
}

function renderReport(element, text) {
  element.innerHTML = markHighlight(redNumber(text)).replace(/\[(\d+)\]/g, '<span class="footnote">[$1]</span>');
}

function renderCharts(data) {
  const gdpCtx = document.getElementById("gdpChart");
  const enterpriseCtx = document.getElementById("enterpriseChart");

  if (gdpChart) gdpChart.destroy();
  if (enterpriseChart) enterpriseChart.destroy();

  gdpChart = new Chart(gdpCtx, {
    type: "line",
    data: {
      labels: years,
      datasets: [
        { label: "第一产业", data: data.macro.map((v) => v.p1), borderColor: "#93c5fd" },
        { label: "第二产业", data: data.macro.map((v) => v.p2), borderColor: "#2563eb" },
        { label: "第三产业", data: data.macro.map((v) => v.p3), borderColor: "#1e3a8a" }
      ]
    },
    options: { plugins: { title: { display: true, text: "三次产业近三年趋势（亿元）" } } }
  });

  const latest = data.macro[data.macro.length - 1];
  enterpriseChart = new Chart(enterpriseCtx, {
    type: "bar",
    data: {
      labels: ["高企", "瞪羚"],
      datasets: [{ label: `${latest.year}年企业数量`, data: [latest.hte, latest.gazelle], backgroundColor: ["#2563eb", "#60a5fa"] }]
    },
    options: { plugins: { title: { display: true, text: "创新企业结构（家）" } }, scales: { y: { beginAtZero: true } } }
  });
}

function exportPdf(title, filename, text) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  doc.text(title, 10, 14);
  doc.setFontSize(11);

  let y = 24;
  text.split("\n").forEach((line) => {
    const wrapped = doc.splitTextToSize(line, 190);
    if (y + wrapped.length * 6 > 280) {
      doc.addPage();
      y = 14;
    }
    doc.text(wrapped, 10, y);
    y += wrapped.length * 6 + 1;
  });
  doc.save(filename);
}

async function collectOfficialData() {
  const region = document.getElementById("targetRegion").value.trim();
  const industry = document.getElementById("targetIndustry").value.trim();
  if (!region || !industry) {
    collectStatus.textContent = "请先填写目标区域和目标产业。";
    return;
  }
  collectBtn.disabled = true;
  collectStatus.textContent = "正在自动采集官方数据...";

  const response = await fetch(`/api/collect-official-data?region=${encodeURIComponent(region)}&industry=${encodeURIComponent(industry)}`);
  const data = await response.json();
  collectedItems = data.items || [];

  if (collectedItems.length === 0) {
    collectStatus.textContent = "未采集到可用官方数据（可稍后重试）。";
    collectList.textContent = "暂无采集结果";
  } else {
    collectStatus.textContent = `采集完成，共 ${collectedItems.length} 条官方数据候选。`;
    collectList.innerHTML = collectedItems.map((item, idx) => `${idx + 1}. ${item.title}\n${item.url}`).join("\n\n");

    const existing = new Set(parseLines(sourcesInput.value));
    collectedItems.forEach((item) => existing.add(item.url));
    sourcesInput.value = [...existing].join("\n");
  }
  collectBtn.disabled = false;
}

async function verifySourcesOnline() {
  const urls = parseLines(sourcesInput.value);
  const verifyEntries = parseVerification(document.getElementById("verification").value);

  if (urls.length === 0) {
    verifyStatus.textContent = "请先填写或采集来源链接。";
    return;
  }

  const entries = [];
  verifyEntries.forEach((item) => {
    [item.s1, item.s2, item.s3].forEach((url) => {
      if (!url) return;
      entries.push({
        url,
        metric: item.metric,
        expectedValues: [item.v1, item.v2, item.v3].filter((v) => Number.isFinite(v)).map(String)
      });
    });
  });

  urls.forEach((url) => {
    entries.push({ url, metric: "来源补充", expectedValues: [] });
  });

  const dedup = [];
  const seen = new Set();
  entries.forEach((item) => {
    const key = `${item.metric}|${item.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(item);
    }
  });

  verifyBtn.disabled = true;
  verifyStatus.textContent = "正在自动核验来源真实性...";

  const response = await fetch('/api/verify-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: dedup })
  });
  const data = await response.json();
  verifyResults = data.results || [];
  verifyRunAt = new Date().toISOString();

  verifyStatus.textContent = `核验完成：通过 ${data.passCount}/${data.total}（审计文件：${data.auditFile || '无'}）`;
  verifyList.innerHTML = verifyResults
    .map((item, idx) => {
      return `${idx + 1}. [${item.verdict}] ${item.url}
   指标: ${item.metric || '无'}
   域名: ${item.hostname} | 评分: ${item.score}
   标题: ${item.title}
   发布日期: ${item.publishDate}
   数值命中: ${(item.matchedValues || []).join(', ') || '无'}
   说明: ${item.reason.join("；")}`;
    })
    .join("\n\n");

  verifyBtn.disabled = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const raw = {
    targetRegion: document.getElementById("targetRegion").value.trim(),
    targetIndustry: document.getElementById("targetIndustry").value.trim(),
    regionFocus: document.getElementById("regionFocus").value.trim(),
    industryFocus: document.getElementById("industryFocus").value.trim(),
    macro: readMacroData(),
    policies: parseLines(document.getElementById("policies").value),
    leaders: parseLines(document.getElementById("leaders").value),
    companies: parseCompanies(document.getElementById("companies").value),
    verify: validateVerification(parseVerification(document.getElementById("verification").value)),
    sources: parseLines(document.getElementById("sources").value)
  };

  if (!raw.targetRegion || !raw.targetIndustry || raw.sources.length === 0) {
    progressStatus.textContent = "请完整填写目标区域、目标产业、关键来源。";
    return;
  }

  if (!raw.verify.ok) {
    progressStatus.innerHTML = `<span class='bad'>${raw.verify.msg}</span>`;
    return;
  }

  const verifiedPass = verifyResults.filter((v) => v.verdict === "通过").length;
  if (!verifyRunAt) {
    progressStatus.innerHTML = "<span class='bad'>请先执行“自动核验来源真实性”。</span>";
    return;
  }
  if (verifiedPass === 0) {
    progressStatus.innerHTML = "<span class='bad'>来源真实性核验未通过，至少需要1条通过结果后再生成报告。</span>";
    return;
  }
  raw.authSummary = `已自动核验${verifyResults.length}条来源，其中通过${verifiedPass}条；最近核验时间：${verifyRunAt}。`;

  startBtn.disabled = true;
  downloadRegionBtn.disabled = true;
  downloadIndustryBtn.disabled = true;
  await runProgress();

  const regionText = buildRegionReport(raw);
  const industryText = buildIndustryReport(raw);

  reportState = { ...raw, regionText, industryText };
  renderReport(regionPreview, regionText);
  renderReport(industryPreview, industryText);
  renderCharts(raw);

  downloadRegionBtn.disabled = false;
  downloadIndustryBtn.disabled = false;
  startBtn.disabled = false;
  progressStatus.innerHTML = "<span class='good'>已完成：区域报告与产业报告均可下载。</span>";
});

downloadRegionBtn.addEventListener("click", () => {
  if (!reportState) return;
  exportPdf(`${reportState.targetRegion}区域调研报告`, `${reportState.targetRegion}区域调研报告.pdf`, reportState.regionText);
});

downloadIndustryBtn.addEventListener("click", () => {
  if (!reportState) return;
  exportPdf(`${reportState.targetIndustry}产业调研报告`, `${reportState.targetIndustry}产业调研报告.pdf`, reportState.industryText);
});

collectBtn.addEventListener("click", collectOfficialData);
verifyBtn.addEventListener("click", verifySourcesOnline);
