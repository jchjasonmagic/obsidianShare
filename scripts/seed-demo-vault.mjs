import fs from "node:fs/promises";
import path from "node:path";

const repoVaultRoot = path.resolve("content", "vault");
const knowledgeRoot = path.join(repoVaultRoot, "Knowledge Points");
const demoRoot = path.join(knowledgeRoot, "Demo");
const generatedRoot = path.join(demoRoot, "Generated");

const topics = [
  { topic: "cognition", label: "认知", stage: "basic", scope: "thinking", kind: "concept" },
  { topic: "psychology", label: "心理学", stage: "basic", scope: "self", kind: "concept" },
  { topic: "complex-systems", label: "复杂系统", stage: "basic", scope: "systems", kind: "model" },
  { topic: "applied-systems", label: "应用系统", stage: "applied", scope: "engineering", kind: "mechanism" },
  { topic: "knowledge-map", label: "知识地图", stage: "applied", scope: "workflow", kind: "process" },
  { topic: "learning-system", label: "学习系统", stage: "applied", scope: "learning", kind: "process" },
  { topic: "life-systems", label: "人生系统", stage: "applied", scope: "life", kind: "principle" },
  { topic: "quant-risk", label: "量化风险", stage: "applied", scope: "finance", kind: "model" },
  { topic: "ai-workflow", label: "AI 工作流", stage: "applied", scope: "ai", kind: "mechanism" },
  { topic: "business", label: "商业", stage: "applied", scope: "business", kind: "principle" },
  { topic: "product-feedback", label: "产品反馈", stage: "output", scope: "product", kind: "process" },
  { topic: "life-science", label: "生命科学", stage: "basic", scope: "biology", kind: "concept" },
  { topic: "expression", label: "表达", stage: "output", scope: "communication", kind: "process" },
  { topic: "investing", label: "投资", stage: "applied", scope: "finance", kind: "principle" },
  { topic: "medicine", label: "医学", stage: "basic", scope: "health", kind: "concept" },
];

function readArg(name) {
  const index = process.argv.findIndex((item) => item === `--${name}`);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function yamlValue(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function seededUnit(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function frontmatter({ type, topic, status, stage, scope, kind, layer, sourceNote }) {
  return `---\n` +
    `type: ${yamlValue(type ?? "knowledge-point")}\n` +
    `topic: ${yamlValue(topic)}\n` +
    `status: ${yamlValue(status ?? "evergreen")}\n` +
    `map_stage: ${yamlValue(stage)}\n` +
    `map_scope: ${yamlValue(scope)}\n` +
    `map_kind: ${yamlValue(kind)}\n` +
    `map_layer: ${yamlValue(layer ?? "point")}\n` +
    (sourceNote ? `source_note: "[[${yamlValue(sourceNote)}]]"\n` : "") +
    `---\n`;
}

function noteMarkdown({ title, meta, body, links }) {
  const linkLines = links.length ? `\n\n## 关联\n\n${links.map((link) => `- [[${link}]]`).join("\n")}\n` : "";
  return `${frontmatter(meta)}\n# ${title}\n\n${body}${linkLines}`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function clearDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

async function writeNote(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

const total = Number(readArg("total") ?? process.env.DEMO_TOTAL ?? 60);
const perTopic = Math.max(1, Math.floor(total / topics.length));
const remainder = Math.max(0, total - perTopic * topics.length);

await ensureDir(repoVaultRoot);
await ensureDir(demoRoot);
await clearDir(generatedRoot);
await ensureDir(generatedRoot);

const hubTitles = [
  "O-DataMap 是什么",
  "双链工作流",
  "构建脚本",
];

const hubEvery = Number(readArg("hubEvery") ?? process.env.DEMO_HUB_EVERY ?? 0);
const crossEvery = Number(readArg("crossEvery") ?? process.env.DEMO_CROSS_EVERY ?? 4);
const sourceEvery = Number(readArg("sourceEvery") ?? process.env.DEMO_SOURCE_EVERY ?? 3);
const candidateRatio = Number(readArg("candidateRatio") ?? process.env.DEMO_CANDIDATE_RATIO ?? 0.22);

const topicIndexTitles = [];

for (const meta of topics) {
  const indexTitle = `主题索引：${meta.label}`;
  topicIndexTitles.push(indexTitle);
  const folder = path.join(generatedRoot, meta.topic);
  await ensureDir(folder);

  const sourceTitle = `来源：${meta.label}`;
  await writeNote(
    path.join(folder, `${sourceTitle}.md`),
    noteMarkdown({
      title: sourceTitle,
      meta: {
        ...meta,
        type: "note",
        status: "evergreen",
        layer: "source",
        kind: "source",
      },
      body: `这是“${meta.label}”主题的一条示例来源笔记，用于演示「来源层」开关与来源边。\n\n它不一定有双链，主要用于承载引用。`,
      links: [],
    }),
  );

  await writeNote(
    path.join(folder, `${indexTitle}.md`),
    noteMarkdown({
      title: indexTitle,
      meta,
      body: `这是示例数据集中的“${meta.label}”归类索引。\n\n这里的内容仅用于演示分类、双链与图谱布局。`,
      links: [...hubTitles],
    }),
  );
}

let created = 0;

for (const [topicIndex, meta] of topics.entries()) {
  const folder = path.join(generatedRoot, meta.topic);
  const count = perTopic + (topicIndex < remainder ? 1 : 0);
  const indexTitle = `主题索引：${meta.label}`;

  for (let i = 1; i <= count; i += 1) {
    const title = `${meta.label}：示例点 ${String(i).padStart(2, "0")}`;
    const prev = i > 1 ? `${meta.label}：示例点 ${String(i - 1).padStart(2, "0")}` : indexTitle;
    const next = i < count ? `${meta.label}：示例点 ${String(i + 1).padStart(2, "0")}` : indexTitle;
    const cross = topics[(topicIndex + i) % topics.length];
    const crossTitle = `主题索引：${cross.label}`;
    const hubTitle = hubTitles.length ? hubTitles[(topicIndex + i) % hubTitles.length] : null;
    const includeCross = Number.isFinite(crossEvery) && crossEvery > 0 && i % crossEvery === 0;
    const includeHub = hubTitle && Number.isFinite(hubEvery) && hubEvery > 0 && i % hubEvery === 0;
    const includeSource = Number.isFinite(sourceEvery) && sourceEvery > 0 && i % sourceEvery === 0;
    const sourceTitle = `来源：${meta.label}`;
    const isCandidate = candidateRatio > 0 && (seededUnit(`candidate:${meta.topic}:${i}:${title}`) < candidateRatio);

    await writeNote(
      path.join(folder, `${title}.md`),
      noteMarkdown({
        title,
        meta: {
          ...meta,
          status: isCandidate ? "candidate" : "evergreen",
          ...(includeSource ? { sourceNote: sourceTitle } : {}),
        },
        body: [
          `这是用于演示的 ${meta.label} 归类节点（第 ${i} 个）。`,
          `建议你把这些文件替换成自己的内容或更贴近你要展示的样例。`,
        ].join("\n\n"),
        links: [
          indexTitle,
          prev,
          next,
          ...(includeCross ? [crossTitle] : []),
          ...(includeHub ? [hubTitle] : []),
        ],
      }),
    );
    created += 1;
  }
}

console.log(JSON.stringify({
  vaultRoot: path.relative(process.cwd(), repoVaultRoot).replaceAll(path.sep, "/"),
  generatedRoot: path.relative(process.cwd(), generatedRoot).replaceAll(path.sep, "/"),
  topics: topics.map((item) => item.topic),
  topicIndexes: topicIndexTitles,
  perTopic,
  remainder,
  created,
  crossEvery,
  hubEvery,
  sourceEvery,
  candidateRatio,
}, null, 2));
