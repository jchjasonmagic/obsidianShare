import fs from "node:fs/promises";
import path from "node:path";

const vault = process.env.OBSIDIAN_VAULT ?? null;
if (!vault) throw new Error("Missing OBSIDIAN_VAULT env var.");
const candidateRoot = path.join(vault, "Knowledge Points", "Gemini");
const formalRoots = [
  path.join(vault, "Knowledge Points", "Core O-DataMap"),
  path.join(vault, "Knowledge Points", "Core Cognition"),
  path.join(vault, "Knowledge Points", "Core Applied Systems"),
  path.join(vault, "Knowledge Points", "Core Psychology"),
  path.join(vault, "Knowledge Points", "Core Life Science"),
  path.join(vault, "Knowledge Points", "Core Life Systems"),
  path.join(vault, "Knowledge Points", "Core Product Feedback"),
  path.join(vault, "Knowledge Points", "Core Quant Risk"),
];

async function markdownFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const next = path.join(root, entry.name);
    if (entry.isDirectory()) return markdownFiles(next);
    return entry.isFile() && entry.name.endsWith(".md") ? [next] : [];
  }));
  return files.flat();
}

function replaceFrontmatterField(frontmatter, key, value) {
  const line = `${key}: ${value}`;
  const pattern = new RegExp(`^${key}:.*$`, "m");
  if (pattern.test(frontmatter)) return frontmatter.replace(pattern, line);
  return `${frontmatter}\n${line}`;
}

function markCandidate(content, role) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return content;

  let frontmatter = match[1];
  frontmatter = replaceFrontmatterField(frontmatter, "curation_status", "reviewed");
  frontmatter = replaceFrontmatterField(frontmatter, "curation_role", role);
  frontmatter = replaceFrontmatterField(
    frontmatter,
    "curation_note",
    role === "evidence"
      ? '"Linked from the formal knowledge layer as evidence."'
      : '"Reviewed and retained in the candidate quarry instead of the formal layer."',
  );
  return content.replace(match[0], `---\n${frontmatter}\n---\n`);
}

const [candidateFiles, formalFiles] = await Promise.all([
  markdownFiles(candidateRoot),
  Promise.all(formalRoots.map(markdownFiles)).then((groups) => groups.flat()),
]);
const formalText = (await Promise.all(formalFiles.map((file) => fs.readFile(file, "utf8")))).join("\n");
let evidence = 0;
let quarry = 0;

for (const file of candidateFiles) {
  const base = path.basename(file, ".md");
  const role = formalText.includes(`[[${base}]]`) ? "evidence" : "quarry";
  const content = await fs.readFile(file, "utf8");
  await fs.writeFile(file, markCandidate(content, role), "utf8");
  if (role === "evidence") evidence += 1;
  else quarry += 1;
}

console.log(JSON.stringify({
  candidates: candidateFiles.length,
  evidence,
  quarry,
  formalNotesScanned: formalFiles.length,
}, null, 2));
