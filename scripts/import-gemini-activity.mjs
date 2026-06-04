import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const activityPath = process.argv[2] ?? null;
const vaultRoot = process.env.OBSIDIAN_VAULT ?? null;
if (!activityPath) throw new Error("Missing activity html path. Usage: node scripts/import-gemini-activity.mjs /path/to/activity.html");
if (!vaultRoot) throw new Error("Missing OBSIDIAN_VAULT env var.");
const maxSources = Number(process.env.GEMINI_MAX_SOURCES ?? 48);
const maxPoints = Number(process.env.GEMINI_MAX_POINTS ?? 140);
const dryRun = process.env.GEMINI_DRY_RUN === "1";
const excludeImported = process.env.GEMINI_EXCLUDE_IMPORTED === "1";
const batchName = process.env.GEMINI_BATCH ?? "General";
const safeBatchName = batchName.replace(/[\\/:*?"<>|]/g, " ").trim() || "General";
const sourceBatchDir = safeBatchName === "General" ? "Gemini Activity" : path.join("Gemini Activity", safeBatchName);
const pointBatchDir = safeBatchName === "General" ? "Gemini" : path.join("Gemini", safeBatchName);
const sourcesDir = path.join(vaultRoot, "Sources", sourceBatchDir);
const pointsDir = path.join(vaultRoot, "Knowledge Points", pointBatchDir);
const promptInclude = (process.env.GEMINI_PROMPT_INCLUDE ?? "")
  .split("|")
  .map((word) => word.trim().toLowerCase())
  .filter(Boolean);
const promptExclude = (process.env.GEMINI_PROMPT_EXCLUDE ?? "")
  .split("|")
  .map((word) => word.trim().toLowerCase())
  .filter(Boolean);
const textInclude = (process.env.GEMINI_TEXT_INCLUDE ?? "")
  .split("|")
  .map((word) => word.trim().toLowerCase())
  .filter(Boolean);
const textExclude = (process.env.GEMINI_TEXT_EXCLUDE ?? "")
  .split("|")
  .map((word) => word.trim().toLowerCase())
  .filter(Boolean);
const sectionInclude = (process.env.GEMINI_SECTION_INCLUDE ?? "")
  .split("|")
  .map((word) => word.trim().toLowerCase())
  .filter(Boolean);
const sectionExclude = (process.env.GEMINI_SECTION_EXCLUDE ?? "")
  .split("|")
  .map((word) => word.trim().toLowerCase())
  .filter(Boolean);

const topicKeywords = [
  "o-datamap", "obsidian", "知识", "认知", "建模", "复杂系统", "涌现", "熵",
  "第一性原理", "因果", "科学", "学习", "系统", "策略", "量化", "投资",
  "ai", "codex", "gemini", "商业", "副业", "产品", "架构", "表达", "医学",
];

const knowledgeKeywords = [
  "本质", "原则", "机制", "模型", "结构", "边界", "路径", "反馈", "约束",
  "相变", "熵", "系统", "复杂", "认知", "因果", "映射", "策略", "杠杆",
  "指标", "风险", "方法", "规律", "框架", "判断", "决策", "涌现",
];

const genericHeadings = [
  /^总结/, /^结论/, /^最后/, /^具体/, /^下一步/, /^怎么做/, /^操作/,
  /^方案[一二三四五六七八九十0-9]/, /^第[一二三四五六七八九十0-9]+步/,
  /^一句话/, /^示例/, /^附/, /^注意/, /^补充/, /^你的/, /^给你的/,
  /^行动/, /^执行/, /^准备/, /^目录$/, /^摘要$/, /^现场演示/, /^演讲金句/,
  /^核心价值对标/, /^我将如何/, /^标题[：:]/, /^举例实操/,
];

function decodeEntities(value) {
  return value
    .replace(/&nbsp;| /g, " ")
    .replace(/&emsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function stripTags(value) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>|<\/li>|<\/h\d>|<\/blockquote>|<\/pre>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function htmlToMarkdown(value) {
  return decodeEntities(value)
    .replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => `\n\`\`\`\n${stripTags(code)}\n\`\`\`\n`)
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => `\n${"#".repeat(Number(level))} ${stripTags(text)}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, text) => `\n- ${stripTags(text)}`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => `\n${stripTags(text)}\n`)
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, text) => `\n> ${stripTags(text).replace(/\n/g, "\n> ")}\n`)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function yaml(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function safeTitle(value, fallback = "未命名知识点") {
  const clean = stripTags(value)
    .replace(/^[\s*#\-]+/, "")
    .replace(/^[一二三四五六七八九十0-9]+[、.．:：\s-]+/, "")
    .replace(/^第[一二三四五六七八九十0-9]+[章节部分步层阶段]*[、.．:：\s-]+/, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 72) || fallback;
}

function compact(value, limit) {
  const clean = stripTags(value).replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit).trim()}...` : clean;
}

function shortHash(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

function slugTime(value) {
  const match = value.match(/(20\d{2})年(\d+)月(\d+)日 (\d\d):(\d\d):(\d\d)/);
  if (!match) return "unknown-time";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")} ${match[4]}-${match[5]}-${match[6]}`;
}

function inferTopic(text) {
  const lower = text.toLowerCase();
  if (lower.match(/o-datamap|obsidian|知识|笔记|向量|图谱/)) return "knowledge-map";
  if (lower.match(/复杂|涌现|相变|熵|系统|反馈/)) return "complex-systems";
  if (lower.match(/认知|建模|学习|科学|第一性原理|因果/)) return "cognition";
  if (lower.match(/投资|量化|股票|仓位|风险|策略/)) return "investing";
  if (lower.match(/ai|codex|gemini|agent|模型/)) return "ai-workflow";
  if (lower.match(/商业|产品|副业|增长|营销/)) return "business";
  if (lower.match(/表达|语言|写作/)) return "expression";
  if (lower.match(/医学|中医|医疗/)) return "medicine";
  return "gemini-insight";
}

function scoreActivity(activity) {
  const lower = `${activity.prompt} ${activity.answerText}`.toLowerCase();
  const topicHits = topicKeywords.filter((word) => lower.includes(word)).length;
  const knowledgeHits = knowledgeKeywords.filter((word) => activity.answerText.includes(word)).length;
  const headingBonus = Math.min(activity.sections.length, 8) * 1.6;
  const lengthBonus = Math.min(activity.answerText.length / 700, 7);
  return topicHits * 1.4 + knowledgeHits * 0.18 + headingBonus + lengthBonus;
}

function matchesPromptFilters(activity) {
  const prompt = activity.prompt.toLowerCase();
  const includeMatch = !promptInclude.length || promptInclude.some((word) => prompt.includes(word));
  const excludeMatch = promptExclude.some((word) => prompt.includes(word));
  return includeMatch && !excludeMatch;
}

function matchesTextFilters(activity) {
  const text = `${activity.prompt} ${activity.answerText}`.toLowerCase();
  const includeMatch = !textInclude.length || textInclude.some((word) => text.includes(word));
  const excludeMatch = textExclude.some((word) => text.includes(word));
  return includeMatch && !excludeMatch;
}

function extractSections(answerHtml, prompt) {
  const matches = [...answerHtml.matchAll(/<h([234])[^>]*>([\s\S]*?)<\/h\1>/gi)];
  if (!matches.length) {
    return [{
      title: safeTitle(prompt, "Gemini 回答中的核心判断"),
      html: answerHtml,
    }];
  }

  return matches.map((match, index) => ({
    title: safeTitle(match[2], safeTitle(prompt, "Gemini 回答中的核心判断")),
    html: answerHtml.slice(match.index + match[0].length, matches[index + 1]?.index ?? answerHtml.length),
  }));
}

function usefulSection(section) {
  const text = stripTags(section.html);
  const sectionText = `${section.title} ${text}`;
  const lower = sectionText.toLowerCase();
  const keywordHits = knowledgeKeywords.filter((word) => sectionText.includes(word)).length;
  const sectionMatch = !sectionInclude.length || sectionInclude.some((word) => lower.includes(word));
  const sectionRejected = sectionExclude.some((word) => lower.includes(word));
  return (
    text.length >= 110 &&
    text.length <= 3600 &&
    !genericHeadings.some((pattern) => pattern.test(section.title)) &&
    sectionMatch &&
    !sectionRejected &&
    (keywordHits >= 1 || text.length >= 320)
  );
}

function parseActivityBlocks(html) {
  return html
    .split('<div class="outer-cell mdl-cell mdl-cell--12-col mdl-shadow--2dp">')
    .slice(1)
    .map((block, index) => {
      const rawCell = block.match(/<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">([\s\S]*?)<\/div><div class="content-cell mdl-cell mdl-cell--6-col/);
      if (!rawCell) return null;
      const cellHtml = rawCell[1];
      const plain = stripTags(cellHtml);
      const intro = plain.match(/^Prompted\s*([\s\S]*?)\s+(20\d{2}年\d+月\d+日 \d\d:\d\d:\d\d GMT[+\-]\d\d:\d\d)\s*([\s\S]*)$/);
      if (!intro) return null;
      const answerStart = cellHtml.search(/<(p|h[1-6]|ul|ol|blockquote|pre)\b/i);
      const answerHtml = answerStart >= 0 ? cellHtml.slice(answerStart) : "";
      const prompt = intro[1]
        .replace(/Attached[\s\S]*$/i, "")
        .replace(/[\s\n]+/g, " ")
        .trim();
      const answerText = stripTags(answerHtml);
      if (!prompt || answerText.length < 500) return null;
      const sections = extractSections(answerHtml, prompt).filter(usefulSection);
      if (!sections.length) return null;
      return {
        index: index + 1,
        prompt,
        time: intro[2],
        answerHtml,
        answerText,
        sections,
      };
    })
    .filter(Boolean);
}

function sourceNote(activity) {
  const title = `Gemini ${slugTime(activity.time)} ${safeTitle(activity.prompt, "活动")}`;
  const body = htmlToMarkdown(activity.answerHtml);
  return {
    title,
    fileName: `${title.slice(0, 118)}.md`,
    markdown: `---
type: gemini-activity-source
topic: ${inferTopic(`${activity.prompt} ${activity.answerText}`)}
status: imported
map: o-map
map_layer: source
map_scope: cross-scale
map_stage: source
map_kind: conversation
gemini_activity_index: ${activity.index}
gemini_time: ${yaml(activity.time)}
prompt: ${yaml(compact(activity.prompt, 220))}
---

# ${title}

## Prompt

${activity.prompt}

## Gemini Response

${body}
`,
  };
}

function pointNote(activity, source, section, ordinal, titleCounts) {
  const title = safeTitle(section.title, safeTitle(activity.prompt, "Gemini 知识点"));
  const count = (titleCounts.get(title) ?? 0) + 1;
  titleCounts.set(title, count);
  const suffix = count > 1 ? ` ${shortHash(`${activity.index}-${ordinal}-${title}`)}` : "";
  const fileTitle = `Gemini KP ${title}${suffix}`;
  const topic = inferTopic(`${activity.prompt} ${section.title} ${stripTags(section.html)}`);
  const excerpt = compact(section.html, 880);
  return {
    title: fileTitle,
    fileName: `${fileTitle.slice(0, 118)}.md`,
    markdown: `---
type: knowledge-point
topic: ${topic}
status: candidate
map: o-map
map_layer: point
map_scope: cross-scale
map_stage: captured
map_kind: claim
source_note: ${yaml(source.title)}
gemini_batch: ${yaml(safeBatchName)}
gemini_activity_index: ${activity.index}
gemini_time: ${yaml(activity.time)}
source_prompt: ${yaml(compact(activity.prompt, 220))}
---

# ${title}

${excerpt}

## 来源

- 源活动：[[${source.title}]]
- 原问题：${activity.prompt}

## 审核

- [ ] 保留
- [ ] 改写为自己的判断
- [ ] 与重复知识点合并
`,
  };
}

async function writeNotes(dir, notes) {
  await fs.mkdir(dir, { recursive: true });
  await Promise.all(notes.map((note) => fs.writeFile(path.join(dir, note.fileName), note.markdown)));
}

async function walkMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkMarkdownFiles(nextPath));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(nextPath);
  }

  return files;
}

async function importedActivityIndexes() {
  const sourceRoot = path.join(vaultRoot, "Sources", "Gemini Activity");
  const sourceFiles = await walkMarkdownFiles(sourceRoot);
  const indexes = await Promise.all(sourceFiles.map(async (filePath) => {
    const source = await fs.readFile(filePath, "utf8");
    return Number(source.match(/^gemini_activity_index:\s*(\d+)/m)?.[1]);
  }));
  return new Set(indexes.filter(Number.isFinite));
}

const html = await fs.readFile(activityPath, "utf8");
const parsedActivities = parseActivityBlocks(html);
const alreadyImported = excludeImported ? await importedActivityIndexes() : new Set();
const activities = parsedActivities
  .map((activity) => ({ ...activity, score: scoreActivity(activity) }))
  .filter(matchesPromptFilters)
  .filter(matchesTextFilters)
  .filter((activity) => !alreadyImported.has(activity.index))
  .filter((activity) => activity.score >= 8)
  .sort((left, right) => right.score - left.score)
  .slice(0, maxSources);

const sources = activities.map(sourceNote);
const titleCounts = new Map();
const points = [];
for (const [sourceIndex, activity] of activities.entries()) {
  for (const [sectionIndex, section] of activity.sections.entries()) {
    if (points.length >= maxPoints) break;
    points.push(pointNote(activity, sources[sourceIndex], section, sectionIndex, titleCounts));
  }
  if (points.length >= maxPoints) break;
}

if (!dryRun) {
  await fs.rm(sourcesDir, { recursive: true, force: true });
  await fs.rm(pointsDir, { recursive: true, force: true });
  await writeNotes(sourcesDir, sources);
  await writeNotes(pointsDir, points);
}

const indexName = safeBatchName === "General" ? "Gemini 知识点导入索引.md" : `Gemini ${safeBatchName} 知识点导入索引.md`;
const indexPath = path.join(vaultRoot, indexName);
if (!dryRun) await fs.writeFile(indexPath, `---
type: import-index
topic: gemini-insight
status: imported
map: o-map
map_layer: source
map_scope: cross-scale
map_stage: output
map_kind: index
---

# Gemini ${safeBatchName} 知识点导入索引

本次从 Gemini 活动记录中筛选高信息密度活动，再按回答中的结构标题切成候选知识点。

- 批次：${safeBatchName}
- 来源文件：\`${activityPath}\`
- 来源活动：${sources.length}
- 候选知识点：${points.length}
- 导入策略：优先保留有完整回答、结构标题和可独立复用判断的活动块。
${promptInclude.length ? `- Prompt 主题词：${promptInclude.join("、")}` : ""}
${textInclude.length ? `- 对话主题词：${textInclude.join("、")}` : ""}
${sectionInclude.length ? `- 章节主题词：${sectionInclude.join("、")}` : ""}

## 审核入口

- 候选知识点目录：[[${pointBatchDir.replaceAll(path.sep, "/")}]]
- 来源活动目录：[[${sourceBatchDir.replaceAll(path.sep, "/")}]]

## 候选知识点队列

\`\`\`dataview
TABLE topic AS "主题", map_kind AS "类型", gemini_time AS "时间", source_prompt AS "来源问题"
FROM "${path.join("Knowledge Points", pointBatchDir).replaceAll(path.sep, "/")}"
WHERE status = "candidate"
SORT gemini_time DESC, file.name ASC
\`\`\`

## 使用建议

1. 先在候选知识点里勾选真正认同的点。
2. 把保留点改写成自己的语言，再补人工双链。
3. 对金融、医学和时效性结论单独复核，不把 Gemini 原回答直接当事实。
`);

console.log(JSON.stringify({
  parsedActivities: parsedActivities.length,
  excludedImportedActivities: alreadyImported.size,
  importedSources: sources.length,
  importedPoints: points.length,
  selectedActivities: activities.map((activity) => ({
    index: activity.index,
    score: Number(activity.score.toFixed(2)),
    time: activity.time,
    prompt: compact(activity.prompt, 180),
  })),
  sourcesDir,
  pointsDir,
  indexPath,
}, null, 2));
