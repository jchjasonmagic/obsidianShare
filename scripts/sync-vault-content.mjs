import fs from "node:fs/promises";
import path from "node:path";

const sourceVaultRoot = process.env.OBSIDIAN_VAULT ?? null;
const targetVaultRoot = path.resolve("content", "vault");

const rootMarkdownAllowList = [
  /核心知识层\.md$/,
  /子图\.md$/,
  /^知识地图正式总图\.md$/,
  /^双链\.md$/,
];

async function removeIfExists(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(sourceDir, targetDir) {
  await ensureDir(targetDir);
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    await ensureDir(path.dirname(targetPath));
    await fs.copyFile(sourcePath, targetPath);
  }
}

async function copyRootMarkdownFiles() {
  const entries = await fs.readdir(sourceVaultRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    if (!rootMarkdownAllowList.some((pattern) => pattern.test(entry.name))) continue;
    const sourcePath = path.join(sourceVaultRoot, entry.name);
    const targetPath = path.join(targetVaultRoot, entry.name);
    await fs.copyFile(sourcePath, targetPath);
  }
}

if (!sourceVaultRoot) {
  console.log("OBSIDIAN_VAULT is not set. Skip syncing and keep existing content/vault.");
  process.exit(0);
}

if (!(await pathExists(sourceVaultRoot))) {
  throw new Error(`OBSIDIAN_VAULT not found: ${sourceVaultRoot}`);
}

await ensureDir(targetVaultRoot);
await removeIfExists(path.join(targetVaultRoot, "Knowledge Points"));
await copyDirectory(
  path.join(sourceVaultRoot, "Knowledge Points"),
  path.join(targetVaultRoot, "Knowledge Points"),
);
await copyRootMarkdownFiles();

console.log(`Synced vault content into ${targetVaultRoot}`);
