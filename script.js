const form = document.getElementById("reportForm");
const startBtn = document.getElementById("startBtn");
const progressList = document.getElementById("progressList");
const progressStatus = document.getElementById("progressStatus");
const downloadRegionBtn = document.getElementById("downloadRegionBtn");
const downloadIndustryBtn = document.getElementById("downloadIndustryBtn");
const reportPreview = document.getElementById("reportPreview");
const evidenceList = document.getElementById("evidenceList");
const addEvidenceBtn = document.getElementById("addEvidenceBtn");
const evidenceTemplate = document.getElementById("evidenceTemplate");

const steps = [
  { text: "要求分析中", delay: 1200 },
  { text: "信息收集中", delay: 1500 },
  { text: "信息处理中", delay: 1200 },
  { text: "报告撰写中", delay: 1200 },
  { text: "整理输出中", delay: 1000 }
];

let currentInput = null;
let industryChartRef = null;
let enterpriseChartRef = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addEvidenceItem(defaults = {}) {
  const fragment = evidenceTemplate.content.cloneNode(true);
  const wrapper = fragment.querySelector(".evidence-item");
  wrapper.querySelector(".e-name").value = defaults.name || "";
  wrapper.querySelector(".e-value").value = defaults.value || "";
  wrapper.querySelector(".e-s1").value = defaults.s1 || "";
  wrapper.querySelector(".e-s2").value = defaults.s2 || "";
  wrapper.querySelector(".e-s3").value = defaults.s3 || "";
  wrapper.querySelector(".remove-evidence").addEventListener("click", () => wrapper.remove());
  evidenceList.appendChild(fragment);
}

function getEvidenceItems() {
  return [...evidenceList.querySelectorAll(".evidence-item")].map((item) => ({
    name: item.querySelector(".e-name").value.trim(),
    value: item.querySelector(".e-value").value.trim(),
    s1: item.querySelector(".e-s1").value.trim(),
    s2: item.querySelector(".e-s2").value.trim(),
    s3: item.querySelector(".e-s3").value.trim()
  }));
}

function validateEvidence(evidenceItems) {
  if (evidenceItems.length === 0) return "请至少录入一条数据校验项。";
  const invalid = evidenceItems.find((item) => !item.name || !item.value || !item.s1 || !item.s2 || !item.s3);
  if (invalid) return "每条数据校验项必须包含数据名、数据值和3个来源。";
  return "";
}

function setStepState(activeIndex) {
  [...progressList.children].forEach((li, index) => {
    li.classList.remove("active", "done");
    if (index < activeIndex) li.classList.add("done");
    if (index === activeIndex) li.classList.add("active");
  });
}

async function runProgress() {
  for (let i = 0; i < steps.length; i += 1) {
    setStepState(i);
    progressStatus.textContent = steps[i].text;
    await sleep(steps[i].delay);
  }
  [...progressList.children].forEach((li) => {
    li.classList.remove("active");
    li.classList.add("done");
  });
  progressStatus.textContent = "报告已生成，请下载。";
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildRegionReportText(data) {
  const total = data.gdpPrimary + data.gdpSecondary + data.gdpTertiary;
  const p1 = total ? ((data.gdpPrimary / total) * 100).toFixed(2) : "0.00";
  const p2 = total ? ((data.gdpSecondary / total) * 100).toFixed(2) : "0.00";
  const p3 = total ? ((data.gdpTertiary / total) * 100).toFixed(2) : "0.00";

  const evidenceText = data.evidence
    .map((item, idx) => `${idx + 1}. ${item.name}：${item.value}\n   - 来源1：${item.s1}\n   - 来源2：${item.s2}\n   - 来源3：${item.s3}`)
    .join("\n");

  return `【宏观结论】\n${data.targetRegion}当前具备较强招商竞争力，产业生态表现为“科技引领+产业协同”双轮驱动。~~重点判断：该区域招商重点应优先布局科技型项目、先进制造与产业链关键环节。~~\n\n【近3年宏观经济（录入口径）】\n第一产业 ${data.gdpPrimary} 亿元（占比 ${p1}%）；第二产业 ${data.gdpSecondary} 亿元（占比 ${p2}%）；第三产业 ${data.gdpTertiary} 亿元（占比 ${p3}%）。\n高新技术企业 ${data.highTechCount} 家，瞪羚企业 ${data.gazelleCount} 家，代表企业 ${data.repCompanyCount} 家。\n\n【区域调研重点】\n${data.regionFocus}\n\n【行政区划与地理区位】\n建议结合行政区划特点、交通枢纽、产业空间承载能力评估招商优劣势。\n\n【支柱产业与代表企业】\n以${data.pillarIndustry}为主轴，梳理代表企业行业分类、主导产品、产值与分支机构布局，明确补链强链方向。\n\n【数据三重校验明细】\n${evidenceText}\n\n【数据缺失声明规则】\n如某项指标无法获得公开数据，报告须明确标注：无公开数据。\n\n【关键来源】\n${data.sources.join("\n")}`;
}

function buildIndustryReportText(data) {
  return `【宏观结论】\n${data.targetRegion}的${data.pillarIndustry}产业具备区域竞争力，特征为创新要素密集、链主企业带动明显、应用场景丰富。~~重点判断：未来趋势为数字化、高端化、绿色化并进。~~\n\n【产业介绍】\n围绕产业规模、近年动态、核心企业结构和技术路线进行评估，重点审视科技创新投入与成果转化效率。\n\n【产业政策】\n同时梳理扶持政策（财政、税收、人才、场景）与限制政策（能耗、环保、安全、准入）。\n\n【区域优势与上下游】\n区域优势来自产业基础、人才供给、园区平台和政策执行效率。需明确本地上下游企业协同程度与薄弱环节。\n\n【挑战与风险】\n重点关注：技术迭代压力、关键人才竞争、融资成本、外部需求波动、国际供应链变化。\n\n【行业调研重点】\n${data.industryFocus}\n\n【数据三重校验说明】\n本报告数据必须对应 3 个不同来源交叉验证。\n\n【关键来源】\n${data.sources.join("\n")}`;
}

function renderPreview(regionText, industryText) {
  const html = [regionText, "\n\n------------------------------\n\n", industryText]
    .join("")
    .replace(/(\d+(?:\.\d+)?\s*(?:亿元|家|%))/g, '<span class="red">$1</span>')
    .replace(/~~([^~]+)~~/g, '<span class="highlight">$1</span>');
  reportPreview.innerHTML = html;
}

function renderCharts(data) {
  const industryCtx = document.getElementById("industryChart");
  const enterpriseCtx = document.getElementById("enterpriseChart");

  if (industryChartRef) industryChartRef.destroy();
  if (enterpriseChartRef) enterpriseChartRef.destroy();

  industryChartRef = new Chart(industryCtx, {
    type: "pie",
    data: {
      labels: ["第一产业", "第二产业", "第三产业"],
      datasets: [
        {
          data: [data.gdpPrimary, data.gdpSecondary, data.gdpTertiary],
          backgroundColor: ["#9bc2ff", "#4f82ff", "#1d54f0"]
        }
      ]
    },
    options: {
      plugins: { title: { display: true, text: "三次产业结构（亿元）" } }
    }
  });

  enterpriseChartRef = new Chart(enterpriseCtx, {
    type: "bar",
    data: {
      labels: ["高新技术企业", "瞪羚企业", "代表企业"],
      datasets: [
        {
          label: "企业数量",
          data: [data.highTechCount, data.gazelleCount, data.repCompanyCount],
          backgroundColor: ["#2e6bff", "#4f82ff", "#80a5ff"]
        }
      ]
    },
    options: {
      plugins: { title: { display: true, text: "企业结构（家）" } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function savePdf(filename, title, bodyLines) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  doc.text(title, 10, 14);
  doc.setFontSize(11);

  let y = 24;
  bodyLines.forEach((line) => {
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const evidence = getEvidenceItems();
  const evidenceError = validateEvidence(evidence);
  if (evidenceError) {
    progressStatus.textContent = evidenceError;
    return;
  }

  const raw = {
    targetRegion: document.getElementById("targetRegion").value.trim(),
    pillarIndustry: document.getElementById("pillarIndustry").value.trim(),
    regionFocus: document.getElementById("regionFocus").value.trim(),
    industryFocus: document.getElementById("industryFocus").value.trim(),
    gdpPrimary: safeNumber(document.getElementById("gdpPrimary").value),
    gdpSecondary: safeNumber(document.getElementById("gdpSecondary").value),
    gdpTertiary: safeNumber(document.getElementById("gdpTertiary").value),
    highTechCount: safeNumber(document.getElementById("highTechCount").value),
    gazelleCount: safeNumber(document.getElementById("gazelleCount").value),
    repCompanyCount: safeNumber(document.getElementById("repCompanyCount").value),
    evidence,
    sources: document
      .getElementById("sourceLinks")
      .value.split("\n")
      .map((v) => v.trim())
      .filter(Boolean)
  };

  if (!raw.targetRegion || !raw.pillarIndustry || !raw.regionFocus || !raw.industryFocus || raw.sources.length === 0) {
    progressStatus.textContent = "请完整填写必填项与关键来源。";
    return;
  }

  startBtn.disabled = true;
  downloadRegionBtn.disabled = true;
  downloadIndustryBtn.disabled = true;
  progressStatus.textContent = "任务启动中...";

  await runProgress();

  const regionReport = buildRegionReportText(raw);
  const industryReport = buildIndustryReportText(raw);

  currentInput = {
    ...raw,
    regionReport,
    industryReport
  };

  renderPreview(regionReport, industryReport);
  renderCharts(raw);

  downloadRegionBtn.disabled = false;
  downloadIndustryBtn.disabled = false;
  startBtn.disabled = false;
});

downloadRegionBtn.addEventListener("click", () => {
  if (!currentInput) return;
  savePdf(
    `${currentInput.targetRegion}区域调研报告.pdf`,
    `${currentInput.targetRegion}区域调研报告`,
    currentInput.regionReport.split("\n")
  );
});

downloadIndustryBtn.addEventListener("click", () => {
  if (!currentInput) return;
  savePdf(
    `${currentInput.targetRegion}产业调研报告.pdf`,
    `${currentInput.targetRegion}产业调研报告`,
    currentInput.industryReport.split("\n")
  );
});

addEvidenceBtn.addEventListener("click", () => addEvidenceItem());

addEvidenceItem({
  name: "高新技术企业数量",
  value: "示例：1200 家",
  s1: "https://example.gov.cn/report-a",
  s2: "https://example.gov.cn/yearbook-b",
  s3: "https://example.org/industry-c"
});
