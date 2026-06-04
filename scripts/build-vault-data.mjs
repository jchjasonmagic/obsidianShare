import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { PCA } from "ml-pca";

const repoContentRoot = path.resolve("content", "vault");
const outputPath = path.resolve("public", "vault-data.json");
const semanticSearchOutputPath = path.resolve("public", "semantic-search.json");
const markdownLinkPattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

const ignoredRoots = new Set([".obsidian", ".smart-env", "Templates"]);

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

const vaultRoot = await pathExists(repoContentRoot) ? repoContentRoot : null;
if (!vaultRoot) {
  throw new Error(`Missing ${repoContentRoot}. Create demo notes under content/vault first.`);
}

const embeddingVaultRoot = process.env.OBSIDIAN_EMBEDDINGS_VAULT ?? null;
const smartSourcesDir = embeddingVaultRoot
  ? path.join(embeddingVaultRoot, ".smart-env", "multi")
  : null;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredRoots.has(entry.name)) continue;
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(nextPath));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(nextPath);
  }

  return files;
}

function noteTitle(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

function noteId(relativePath) {
  return relativePath.replace(/\.md$/, "").replaceAll(path.sep, "/");
}

function cleanBody(body) {
  return body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, "$2$1")
    .trim();
}

function parseLinks(body) {
  return [...body.matchAll(markdownLinkPattern)].map((match) => match[1].trim());
}

function refTitle(value) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw)
    .replace(/^\[\[/, "")
    .replace(/\]\]$/, "")
    .split("|")[0]
    .split("#")[0]
    .trim();
}

function seededOffset(seed, amplitude = 3.2) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const theta = ((hash % 3600) / 3600) * Math.PI * 2;
  const phi = ((((hash >>> 7) % 1200) / 1200) * 0.8 + 0.1) * Math.PI;
  const radius = amplitude * (0.72 + (((hash >>> 17) % 1000) / 1000) * 0.9);
  return [
    Math.cos(theta) * Math.sin(phi) * radius,
    Math.sin(theta) * Math.sin(phi) * radius * 0.84,
    Math.cos(phi) * radius * 0.92,
  ];
}

function seededUnit(seed) {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function blendPosition(base, accent, ratio) {
  return base.map((value, index) => value * (1 - ratio) + accent[index] * ratio);
}

function topicCenter(topic) {
  if (topic === "unmapped") return [0, 0, -2];
  const seed = seededUnit(`topic:${topic}`);
  const angle = seed * Math.PI * 2;
  const ring = 10 + seed * 4;
  const height = (seededUnit(`topic:${topic}:z`) - 0.5) * 6;
  return [
    Math.cos(angle) * ring,
    Math.sin(angle) * ring * 0.72,
    height,
  ];
}

async function loadEmbeddingMap() {
  if (!smartSourcesDir) return new Map();
  const embeddingFiles = await fs.readdir(smartSourcesDir).catch(() => []);
  const embeddings = new Map();

  for (const fileName of embeddingFiles.filter((name) => name.endsWith(".ajson"))) {
    const firstLine = (await fs.readFile(path.join(smartSourcesDir, fileName), "utf8"))
      .split("\n")
      .find((line) => line.startsWith("\"smart_sources:"));

    if (!firstLine) continue;

    const splitAt = firstLine.indexOf(": ");
    const objectSource = firstLine.slice(splitAt + 2);
    let depth = 0;
    let end = -1;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < objectSource.length; index += 1) {
      const char = objectSource[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") inString = true;
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0 && char === "}") {
        end = index + 1;
        break;
      }
    }

    if (end < 0) continue;
    const record = JSON.parse(objectSource.slice(0, end));
    const model = Object.values(record.embeddings ?? {})[0];
    if (!model?.vec?.length || !record.path?.endsWith(".md")) continue;
    embeddings.set(record.path, model.vec);
  }

  return embeddings;
}

function normalizeProjection(rows) {
  const axes = [0, 1, 2].map((axis) => rows.map((row) => row[axis] ?? 0));
  const ranges = axes.map((values) => ({
    min: Math.min(...values),
    max: Math.max(...values),
  }));

  return rows.map((row) => {
    const normalized = row.slice(0, 3).map((value, axis) => {
      const { min, max } = ranges[axis];
      if (max === min) return 0;
      const centered = ((value - min) / (max - min) - 0.5) * 2;
      const curved = Math.sign(centered) * Math.pow(Math.abs(centered), 0.82);
      const axisScale = axis === 0 ? 24 : axis === 1 ? 20 : 18;
      return curved * axisScale;
    });

    const radial = Math.hypot(...normalized);
    const expansion = 1.04 + radial * 0.035;
    return [
      normalized[0] * expansion,
      normalized[1] * expansion,
      normalized[2] * (0.96 + radial * 0.025),
    ];
  });
}

function cosine(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function fallbackEmbeddingVector({ id, title, topic }) {
  const dims = 32;
  const topicBase = Array.from({ length: dims }, (_, index) => (
    (seededUnit(`topic:${topic}:${index}`) - 0.5) * 2
  ));
  const noteNoise = Array.from({ length: dims }, (_, index) => (
    (seededUnit(`note:${id}:${title}:${index}`) - 0.5) * 0.48
  ));
  return topicBase.map((value, index) => value + noteNoise[index]);
}

function normalizeVector(vector) {
  const norm = Math.hypot(...vector);
  if (!norm) return vector.map(() => 0);
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function rankSemanticEdges(edges, perNodeLimit) {
  const degrees = new Map();
  const ranked = [];

  for (const edge of edges.sort((left, right) => (
    right.weight - left.weight || left.seq - right.seq
  ))) {
    const sourceDegree = degrees.get(edge.source) ?? 0;
    const targetDegree = degrees.get(edge.target) ?? 0;
    if (sourceDegree >= perNodeLimit || targetDegree >= perNodeLimit) continue;
    ranked.push(edge);
    degrees.set(edge.source, sourceDegree + 1);
    degrees.set(edge.target, targetDegree + 1);
  }

  return ranked;
}

function keepTopCandidates(candidatesById, noteId, edge, limit) {
  const candidates = candidatesById.get(noteId) ?? [];
  const last = candidates[candidates.length - 1];

  if (
    candidates.length >= limit &&
    (last.weight > edge.weight || (last.weight === edge.weight && last.seq < edge.seq))
  ) {
    return;
  }

  let insertAt = candidates.length;
  while (insertAt > 0) {
    const current = candidates[insertAt - 1];
    if (current.weight > edge.weight) break;
    if (current.weight === edge.weight && current.seq < edge.seq) break;
    insertAt -= 1;
  }

  candidates.splice(insertAt, 0, edge);
  if (candidates.length > limit) candidates.pop();
  candidatesById.set(noteId, candidates);
}

const markdownFiles = await walk(vaultRoot);
const embeddingMap = await loadEmbeddingMap();
const notes = [];
const embeddedNotes = [];

for (const filePath of markdownFiles) {
  const relativePath = path.relative(vaultRoot, filePath);
  const source = await fs.readFile(filePath, "utf8");
  const parsed = matter(source);
  const title = noteTitle(filePath);
  const normalizedPath = relativePath.replaceAll(path.sep, "/");
  const embedding = embeddingMap.get(normalizedPath) ?? null;
  const layer = parsed.data.map_layer ?? (parsed.data.type === "knowledge-point" ? "point" : "source");
  const status = parsed.data.status ?? "draft";
  const topic = parsed.data.topic ?? "unmapped";

  notes.push({
    id: noteId(relativePath),
    title,
    path: normalizedPath,
    type: parsed.data.type ?? "note",
    topic,
    stage: parsed.data.map_stage ?? "unmapped",
    scope: parsed.data.map_scope ?? "unmapped",
    kind: parsed.data.map_kind ?? parsed.data.type ?? "note",
    layer,
    sourceTitle: refTitle(parsed.data.source_note),
    status,
    links: parseLinks(parsed.content),
    body: cleanBody(parsed.content),
  });

  if (layer === "point") {
    const vector = embedding ?? fallbackEmbeddingVector({
      id: noteId(relativePath),
      title,
      topic,
    });

    embeddedNotes.push({
      id: noteId(relativePath),
      title,
      topic,
      layer,
      status,
      vector,
    });
    if (embedding) embeddingMap.delete(normalizedPath);
  }
}

const titleToId = new Map(notes.map((note) => [note.title, note.id]));
const projection = embeddedNotes.length >= 3
  ? normalizeProjection(new PCA(embeddedNotes.map((note) => note.vector)).predict(
    embeddedNotes.map((note) => note.vector),
    { nComponents: 3 },
  ).to2DArray())
  : embeddedNotes.map((_, index) => [index * 2, 0, 0]);

const positionById = new Map(embeddedNotes.map((note, index) => [note.id, projection[index]]));

const hydratedNotes = notes.map((note, index) => {
  const sourceId = note.sourceTitle ? titleToId.get(note.sourceTitle) : null;
  const sourcePosition = sourceId ? positionById.get(sourceId) : null;
  const offset = seededOffset(note.id, note.layer === "point" ? 2.8 : 1.8);
  const topicalCenter = topicCenter(note.topic);
  const embeddedPosition = positionById.get(note.id)
    ? blendPosition(positionById.get(note.id), topicalCenter, note.layer === "point" ? 0.24 : 0.16)
    : null;

  return {
    ...note,
    sourceId,
    embedded: positionById.has(note.id),
    position: embeddedPosition ?? (sourcePosition ? [
      sourcePosition[0] + offset[0],
      sourcePosition[1] + offset[1],
      sourcePosition[2] + offset[2],
    ] : [
      topicalCenter[0] + Math.cos(index * 1.4) * 3.2,
      topicalCenter[1] + Math.sin(index * 1.2) * 2.8,
      topicalCenter[2] + ((index % 7) - 3) * 1.8,
    ]),
  };
});

const manualEdges = [];
const manualPairs = new Set();
for (const note of notes) {
  for (const targetTitle of note.links) {
    const target = titleToId.get(targetTitle);
    if (!target || target === note.id) continue;
    const pairId = [note.id, target].sort().join("<->");
    if (manualPairs.has(pairId)) continue;
    manualPairs.add(pairId);
    manualEdges.push({
      id: `${note.id}->${target}`,
      source: note.id,
      target,
      weight: 1,
      mode: "link",
    });
  }
}

const sourceEdges = hydratedNotes
  .filter((note) => note.layer === "point" && note.sourceId)
  .map((note) => ({
    id: `${note.sourceId}=>${note.id}`,
    source: note.sourceId,
    target: note.id,
    weight: 1,
    mode: "source",
  }));

const semanticCandidateLimit = 32;
const semanticCandidatesById = new Map();
let semanticSequence = 0;
for (let leftIndex = 0; leftIndex < embeddedNotes.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < embeddedNotes.length; rightIndex += 1) {
    const left = embeddedNotes[leftIndex];
    const right = embeddedNotes[rightIndex];
    const score = cosine(left.vector, right.vector);
    if (score < 0.68) continue;
    const edge = {
      id: `${left.id}~${right.id}`,
      source: left.id,
      target: right.id,
      weight: Number(score.toFixed(3)),
      mode: "semantic",
      seq: semanticSequence,
    };
    semanticSequence += 1;
    keepTopCandidates(semanticCandidatesById, left.id, edge, semanticCandidateLimit);
    keepTopCandidates(semanticCandidatesById, right.id, edge, semanticCandidateLimit);
  }
}

const semanticEdges = [...new Map(
  [...semanticCandidatesById.values()]
    .flat()
    .map((edge) => [edge.id, edge]),
).values()];
const rankedSemanticEdges = rankSemanticEdges(semanticEdges, 4)
  .slice(0, Math.max(18, embeddedNotes.length * 2))
  .map(({ seq, ...edge }) => edge);

for (const note of embeddedNotes) {
  note.vector = normalizeVector(note.vector);
}
const embeddedVectorById = new Map(embeddedNotes.map((note) => [note.id, note.vector]));

const semanticSearchNodes = notes
  .filter((note) => (
    note.layer === "point" &&
    note.status === "evergreen" &&
    positionById.has(note.id)
  ))
  .map((note) => ({
    id: note.id,
    title: note.title,
    topic: note.topic,
    embedding: embeddedVectorById.get(note.id) ?? [],
  }));

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  vaultRoot: path.relative(process.cwd(), vaultRoot).replaceAll(path.sep, "/"),
  vectorModel: "TaylorAI/bge-micro-v2",
  nodes: hydratedNotes,
  edges: [...manualEdges, ...sourceEdges, ...rankedSemanticEdges],
}, null, 2));
await fs.writeFile(semanticSearchOutputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  vectorModel: "TaylorAI/bge-micro-v2",
  nodes: semanticSearchNodes,
}, null, 2));

console.log(`Built ${outputPath} from ${notes.length} notes and ${embeddedNotes.length} vectors.`);
