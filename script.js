const form = document.getElementById("reportForm");
const startBtn = document.getElementById("startBtn");
const progressList = document.getElementById("progressList");
const progressStatus = document.getElementById("progressStatus");
const downloadRegionBtn = document.getElementById("downloadRegionBtn");
const downloadIndustryBtn = document.getElementById("downloadIndustryBtn");
const templateUpload = document.getElementById("templateUpload");
const templateInfo = document.getElementById("templateInfo");
const addCaseBtn = document.getElementById("addCaseBtn");
const caseInput = document.getElementById("caseInput");
const caseList = document.getElementById("caseList");

const steps = [
  { text: "要求分析中", delay: 3000 },
  { text: "信息收集中", delay: 4000 },
  { text: "信息处理中", delay: 3000 },
  { text: "报告撰写中", delay: 3000 },
  { text: "整理输出中", delay: 2500 }
];

let currentInput = null;
const cases = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  downloadRegionBtn.disabled = false;
  downloadIndustryBtn.disabled = false;
  startBtn.disabled = false;
}

function drawSectionTitle(doc, title, y) {
  doc.setTextColor(31, 94, 255);
  doc.setFontSize(14);
  doc.text(title, 10, y);
}

function writeParagraph(doc, text, y, maxWidth = 190) {
  doc.setTextColor(23, 35, 61);
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, 10, y);
  return y + lines.length * 6;
}

function generateRegionReport(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(23, 35, 61);
  doc.text(`${data.targetRegion}区域调研报告`, 10, 16);

  drawSectionTitle(doc, "宏观结论", 26);
  let y = writeParagraph(
    doc,
    `综合判断：${data.targetRegion}具备较强招商竞争力，科技要素集聚明显，但在产业链协同和高端人才供给方面存在压力。政府关注点集中在科技创新、先进制造和产业升级，企业关注点集中在市场拓展、融资和政策兑现效率。`,
    34
  );

  drawSectionTitle(doc, "区域调研重点", y + 6);
  y = writeParagraph(doc, `重点关注：${data.regionFocus}。`, y + 14);

  drawSectionTitle(doc, "核心维度摘要", y + 6);
  y = writeParagraph(
    doc,
    "1. 省市区三级政策：梳理招商政策、行业支持政策、规上纳统补贴及高新技术企业补贴，并复核近2年政府工作报告中的科技与招商导向。\n2. 主要领导：归集履历与近期公开讲话，研判产业偏好与招商方向。\n3. 近3年经济：跟踪三次产业结构、高企与瞪羚企业数量及占比。\n4. 行政区划与地理区位：分析交通枢纽、产业空间和区位优劣势。\n5. 支柱产业与代表企业：识别龙头企业、产品、产值及分公司布局。\n6. 孵化器、商协会、园区：评估创新生态承载能力。",
    y + 14
  );

  drawSectionTitle(doc, "数据校验与来源说明", y + 6);
  y = writeParagraph(
    doc,
    "报告中涉及数据需进行三次交叉校验（政府公报、统计年鉴、行业机构报告），并以脚注标注来源。若暂无公开数据，报告将明确披露“无公开数据”。",
    y + 14
  );

  drawSectionTitle(doc, "原文出处", y + 6);
  writeParagraph(
    doc,
    "建议附录列示：政府官网政策原文链接、统计年鉴章节、行业协会公告链接、企业年报链接。",
    y + 14
  );

  doc.save(`${data.targetRegion}区域调研报告.pdf`);
}

function generateIndustryReport(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(23, 35, 61);
  doc.text(`${data.targetRegion}产业调研报告`, 10, 16);

  drawSectionTitle(doc, "宏观结论", 26);
  let y = writeParagraph(
    doc,
    `综合判断：${data.targetRegion}支柱产业具备区域竞争优势，产业链配套较完整，未来趋势表现为“数字化+高端化+绿色化”并行。需重点关注关键技术突破与外部市场波动风险。`,
    34
  );

  drawSectionTitle(doc, "产业调研重点", y + 6);
  y = writeParagraph(doc, `重点关注：${data.industryFocus}。`, y + 14);

  drawSectionTitle(doc, "产业分析框架", y + 6);
  y = writeParagraph(
    doc,
    "1. 产业介绍：规模、增速、近年动态数据。\n2. 产业政策：扶持政策与限制政策并行分析。\n3. 区域优势：解释产业成为支柱产业的资源与制度基础。\n4. 上下游产业链：识别关键环节和本地代表企业。\n5. 挑战与风险：人才、技术、成本、市场、国际竞争。",
    y + 14
  );

  drawSectionTitle(doc, "报告规范", y + 6);
  y = writeParagraph(
    doc,
    "需确保5000字左右，兼顾优势与劣势分析，突出科技维度；数据必须三次校验并以脚注标注来源，缺失数据需明确说明。",
    y + 14
  );

  drawSectionTitle(doc, "原文出处", y + 6);
  writeParagraph(
    doc,
    "建议附录列示：产业政策原文、统计局数据来源、企业年报与公告、第三方行业研究机构报告链接。",
    y + 14
  );

  doc.save(`${data.targetRegion}产业调研报告.pdf`);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  currentInput = {
    targetRegion: document.getElementById("targetRegion").value.trim(),
    regionFocus: document.getElementById("regionFocus").value.trim(),
    industryFocus: document.getElementById("industryFocus").value.trim()
  };

  if (!currentInput.targetRegion || !currentInput.regionFocus || !currentInput.industryFocus) {
    progressStatus.textContent = "请完整填写所有字段。";
    return;
  }

  downloadRegionBtn.disabled = true;
  downloadIndustryBtn.disabled = true;
  startBtn.disabled = true;
  progressStatus.textContent = "任务启动中...";

  await runProgress();
});

downloadRegionBtn.addEventListener("click", () => {
  if (currentInput) {
    generateRegionReport(currentInput);
  }
});

downloadIndustryBtn.addEventListener("click", () => {
  if (currentInput) {
    generateIndustryReport(currentInput);
  }
});

templateUpload.addEventListener("change", () => {
  const file = templateUpload.files[0];
  templateInfo.textContent = file
    ? `已上传模板：${file.name}`
    : "尚未上传模板";
});

addCaseBtn.addEventListener("click", () => {
  const value = caseInput.value.trim();
  if (!value) return;
  cases.push(value);
  const li = document.createElement("li");
  li.textContent = value;
  caseList.appendChild(li);
  caseInput.value = "";
});
