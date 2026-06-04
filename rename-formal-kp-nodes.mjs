import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const vaultRoot = process.env.OBSIDIAN_VAULT ?? null;
if (!vaultRoot) throw new Error("Missing OBSIDIAN_VAULT env var.");
const knowledgeRoot = path.join(vaultRoot, "Knowledge Points");
const coreFolders = [
  "Core Applied Systems",
  "Core Cognition",
  "Core Life Science",
  "Core Life Systems",
  "Core O-DataMap",
  "Core Product Feedback",
  "Core Psychology",
  "Core Quant Risk",
];

const topicLabels = {
  "applied-systems": "应用系统",
  cognition: "认知方法",
  "complex-systems": "复杂系统",
  "knowledge-map": "知识地图",
  "learning-system": "学习系统",
  "life-science": "生命科学",
  "life-systems": "人生系统",
  psychology: "心理结构",
  "product-feedback": "产品反馈",
  "quant-risk": "量化风险",
};

const markdownFiles = [];

async function collectMarkdownFiles(dir, files) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
}

function readTopic(content) {
  return content.match(/^topic:\s*(.+)$/m)?.[1]?.trim();
}

function replaceWikiTarget(content, oldTitle, newTitle) {
  const escaped = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(
    new RegExp(`\\[\\[${escaped}(?=(?:\\||#|\\]\\]))`, "g"),
    `[[${newTitle}`,
  );
}

for (const folder of coreFolders) {
  await collectMarkdownFiles(path.join(knowledgeRoot, folder), markdownFiles);
}

const renameMap = [];

for (const filePath of markdownFiles) {
  const content = await readFile(filePath, "utf8");
  const topic = readTopic(content);
  const label = topicLabels[topic];
  const oldTitle = path.basename(filePath, ".md");

  if (!label) {
    throw new Error(`No topic label for ${topic ?? "missing topic"} in ${filePath}`);
  }

  const newTitle = oldTitle.startsWith(`${label}：`)
    ? oldTitle
    : `${label}：${oldTitle}`;

  renameMap.push({ filePath, oldTitle, newTitle });
}

for (const item of renameMap) {
  if (item.oldTitle === item.newTitle) continue;

  const content = await readFile(item.filePath, "utf8");
  const nextContent = content.replace(
    new RegExp(`^# ${item.oldTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"),
    `# ${item.newTitle}`,
  );

  if (nextContent === content) {
    throw new Error(`Heading not updated in ${item.filePath}`);
  }

  await writeFile(item.filePath, nextContent, "utf8");
  await rename(
    item.filePath,
    path.join(path.dirname(item.filePath), `${item.newTitle}.md`),
  );
}

const allVaultMarkdown = [];
await collectMarkdownFiles(vaultRoot, allVaultMarkdown);

for (const filePath of allVaultMarkdown) {
  let content = await readFile(filePath, "utf8");
  const original = content;

  for (const item of renameMap) {
    if (item.oldTitle === item.newTitle) continue;
    content = replaceWikiTarget(content, item.oldTitle, item.newTitle);
  }

  if (content !== original) {
    await writeFile(filePath, content, "utf8");
  }
}

console.log(`Renamed ${renameMap.filter((item) => item.oldTitle !== item.newTitle).length} formal nodes.`);
