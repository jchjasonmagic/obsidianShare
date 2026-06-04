import * as THREE from "three";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import { marked } from "marked";
import "./styles.css";

const topicPalette = {
  cognition: { color: "#5aa2ff", label: "认知" },
  psychology: { color: "#ff79b7", label: "心理学" },
  "complex-systems": { color: "#4fd17b", label: "复杂系统" },
  "applied-systems": { color: "#ffb24d", label: "应用系统" },
  "knowledge-map": { color: "#a07bff", label: "知识地图" },
  "learning-system": { color: "#a7dc45", label: "学习系统" },
  "life-systems": { color: "#ff9966", label: "人生系统" },
  "quant-risk": { color: "#f6d365", label: "量化风险" },
  "ai-workflow": { color: "#36d1bf", label: "AI 工作流" },
  investing: { color: "#41d39e", label: "投资" },
  business: { color: "#ff6b6b", label: "商业" },
  "product-feedback": { color: "#7f8cff", label: "产品反馈" },
  "life-science": { color: "#8bc34a", label: "生命科学" },
  expression: { color: "#ef72ff", label: "表达" },
  medicine: { color: "#4fd8f0", label: "医学" },
  "gemini-insight": { color: "#9aaec6", label: "候选矿层" },
  unmapped: { color: "#a0aec0", label: "未归类" },
};

const stageLabels = {
  basic: "基础",
  applied: "应用",
  output: "输出",
  unmapped: "游离",
};

const app = document.querySelector("#app");
const data = await fetch("/vault-data.json").then((response) => response.json());
const nodeMap = new Map(data.nodes.map((node) => [node.id, node]));
let nebula;
let graph;
const CANDIDATE_RENDER_LIMIT = 900;
const pointNodes = data.nodes.filter((node) => node.layer === "point");
const reviewedPointNodes = pointNodes.filter((node) => node.status !== "candidate");
const candidatePointNodes = pointNodes.filter((node) => node.status === "candidate");
const sourceNodes = data.nodes.filter((node) => node.layer !== "point");
const pointStructuralDegrees = data.edges.reduce((degrees, edge) => {
  if (edge.mode === "source") return degrees;
  const source = nodeMap.get(edge.source);
  const target = nodeMap.get(edge.target);
  if (source?.layer !== "point" || target?.layer !== "point") return degrees;
  degrees.set(source.id, (degrees.get(source.id) ?? 0) + 1);
  degrees.set(target.id, (degrees.get(target.id) ?? 0) + 1);
  return degrees;
}, new Map());
const topicCounts = reviewedPointNodes.reduce((counts, node) => {
  counts.set(node.topic, (counts.get(node.topic) ?? 0) + 1);
  return counts;
}, new Map());
const filterTopics = [...topicCounts.keys()]
  .sort((left, right) => topicCounts.get(right) - topicCounts.get(left));
const state = {
  selectedId: null,
  fullscreenEditorOpen: false,
  pathIds: [],
  pathEdgeKeys: new Set(),
  pathAnimationStartedAt: 0,
  routePreviewIds: [],
  routeFlashUntil: 0,
  semantic: true,
  sources: false,
  candidates: false,
  topic: "all",
  bridges: false,
};

marked.setOptions({ breaks: true });

app.innerHTML = `
  <main class="shell">
    <header class="hud">
      <div>
        <p class="eyebrow">O-DataMap Presentation Layer</p>
        <h1>认知流形展示台</h1>
      </div>
      <div class="metrics">
        <span><strong>${reviewedPointNodes.length}</strong> 正式点</span>
        <span><strong>${candidatePointNodes.length}</strong> 候选点</span>
        <span><strong>${sourceNodes.length}</strong> 来源笔记</span>
        <span><strong>${data.edges.filter((edge) => edge.mode === "semantic").length}</strong> 语义引力</span>
        <span><strong>${data.vectorModel}</strong> 本地向量</span>
      </div>
    </header>
    <section class="workspace">
      <article class="pane nebula-pane">
        <div class="pane-head">
          <div>
            <p>Topology Nebula</p>
            <h2>3D 流形星云</h2>
          </div>
        </div>
        <div class="nebula-topic-strip" id="nebula-topic-strip">
          <div class="nebula-topic-scroll" id="nebula-topic-scroll">
            <div class="nebula-topic-track">
              <span class="nebula-topic-chip active" data-topic="all" style="--legend-color: #a0aec0">全部</span>
              ${filterTopics.map((topic) => `
                <span class="nebula-topic-chip" data-topic="${topic}" style="--legend-color: ${(topicPalette[topic] ?? topicPalette.unmapped).color}">${(topicPalette[topic] ?? topicPalette.unmapped).label}</span>
              `).join("")}
            </div>
          </div>
        </div>
        <div class="nebula" id="nebula"></div>
        <p class="hint">拖动平移，滚轮穿梭，按住 Command 拖动可选中节点，按住 Option 拖动可旋转，点亮星点会联动右侧笔记。</p>
      </article>
      <article class="pane graph-pane">
        <div class="pane-head graph-head">
          <div>
            <p>Force-Directed Linkage</p>
            <h2>动态拓扑引力网</h2>
          </div>
          <div class="graph-actions">
            <label class="switch">
              <span>AI 连线</span>
              <input id="semantic-toggle" type="checkbox" checked />
            </label>
            <label class="switch">
              <span>来源层</span>
              <input id="source-toggle" type="checkbox" />
            </label>
            <label class="switch">
              <span>候选层</span>
              <input id="candidate-toggle" type="checkbox" />
            </label>
            <label class="switch bridge-switch">
              <span>跨域桥</span>
              <input id="bridge-toggle" type="checkbox" />
            </label>
            <button id="graph-fullscreen" class="panel-action" type="button">全屏</button>
          </div>
        </div>
        <form class="route" id="route-form">
          <div class="route-input-wrapper">
            <input id="route-from" autocomplete="off" placeholder="起点，例如 语义向量" />
            <ul class="autocomplete-dropdown" id="route-from-options"></ul>
          </div>
          <div class="route-input-wrapper">
            <input id="route-to" autocomplete="off" placeholder="终点，例如 认知导航" />
            <ul class="autocomplete-dropdown" id="route-to-options"></ul>
          </div>
          <button type="submit">高亮路径</button>
          <div class="route-feedback" id="route-feedback">
            <span class="route-feedback-item route-feedback-item--from" id="route-from-match">
              <span class="route-feedback-label">起点：</span>
              <span class="route-feedback-value">未输入</span>
            </span>
            <span class="route-feedback-item route-feedback-item--to" id="route-to-match">
              <span class="route-feedback-label">终点：</span>
              <span class="route-feedback-value">未输入</span>
            </span>
            <div class="route-semantic hidden" id="route-from-semantic"></div>
            <div class="route-semantic hidden" id="route-to-semantic"></div>
          </div>
        </form>
        <section class="focus-bar">
          <label class="topic-select" for="topic-select">
            <span>分类</span>
            <select id="topic-select">
              <option value="all">全部</option>
              ${filterTopics.map((topic) => `
                <option value="${topic}">
                  ${(topicPalette[topic] ?? topicPalette.unmapped).label} (${topicCounts.get(topic)})
                </option>
              `).join("")}
            </select>
          </label>
          <div class="topic-filters" id="topic-filters">
            <button class="active" data-topic="all" type="button">全部</button>
            ${filterTopics.map((topic) => `
              <button
                data-topic="${topic}"
                style="--topic-color: ${(topicPalette[topic] ?? topicPalette.unmapped).color}"
                type="button"
              >
                ${(topicPalette[topic] ?? topicPalette.unmapped).label}
                <strong>${topicCounts.get(topic)}</strong>
              </button>
            `).join("")}
          </div>
        </section>
        <canvas class="graph" id="graph"></canvas>
        <div class="graph-node-actions hidden" id="graph-node-actions">
          <button
            class="route-action-button"
            type="button"
            data-route-endpoint="from"
            title="设为高亮路径起点"
            aria-label="设为高亮路径起点"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="4" cy="8" r="2.25" fill="none" stroke="currentColor" stroke-width="1.4"></circle>
              <path d="M6.8 8h5.7M10.5 5.2 13.3 8l-2.8 2.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"></path>
            </svg>
          </button>
          <button
            class="route-action-button"
            type="button"
            data-route-endpoint="to"
            title="设为高亮路径终点"
            aria-label="设为高亮路径终点"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.7 8h5.2M5.4 5.2 8.2 8l-2.8 2.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"></path>
              <circle cx="11.4" cy="8" r="2.25" fill="none" stroke="currentColor" stroke-width="1.4"></circle>
            </svg>
          </button>
        </div>
        <aside class="fullscreen-editor" id="graph-fullscreen-editor" data-editor-surface>
          <div class="pane-head editor-head">
            <div>
              <p>Atomic Workbench</p>
              <h2>原子笔记编辑面</h2>
            </div>
            <div class="editor-actions">
              <a class="obsidian-link" data-role="obsidian-link">在 Obsidian 打开</a>
              <button class="close-button" id="close-fullscreen-editor" aria-label="关闭" title="关闭">
                <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
                  <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="selected-meta" data-role="selected-meta"></div>
          <article class="note-body" data-role="note-body"></article>
          <section class="connections">
            <h3>引力邻居</h3>
            <div data-role="neighbors"></div>
          </section>
        </aside>
      </article>
      <aside class="pane editor-pane" data-editor-surface>
        <div class="pane-head editor-head">
          <div>
            <p>Atomic Workbench</p>
            <h2>原子笔记编辑面</h2>
          </div>
          <a id="obsidian-link" class="obsidian-link" data-role="obsidian-link">在 Obsidian 打开</a>
        </div>
        <div class="selected-meta" id="selected-meta" data-role="selected-meta"></div>
        <article class="note-body" id="note-body" data-role="note-body"></article>
        <section class="connections">
          <h3>引力邻居</h3>
          <div id="neighbors" data-role="neighbors"></div>
        </section>
      </aside>
    </section>
  </main>
`;

const routeFromInput = document.querySelector("#route-from");
const routeToInput = document.querySelector("#route-to");
const routeFromMatch = document.querySelector("#route-from-match");
const routeToMatch = document.querySelector("#route-to-match");
const routeFromSemantic = document.querySelector("#route-from-semantic");
const routeToSemantic = document.querySelector("#route-to-semantic");
const routeForm = document.querySelector("#route-form");
const semanticSearchState = {
  indexPromise: null,
  extractorPromise: null,
  queryEmbeddings: new Map(),
  activeEndpoint: null,
  requestIds: {
    from: 0,
    to: 0,
  },
};

function nodeColor(node) {
  if (node.layer !== "point") return "#8fa8c4";
  return (topicPalette[node.topic] ?? topicPalette.unmapped).color;
}

function topicMeta(topic) {
  return topicPalette[topic] ?? topicPalette.unmapped;
}

function nodeOpacity(node) {
  if (node.layer !== "point") return node.embedded ? 0.62 : 0.38;
  if (node.status === "candidate") return node.embedded ? 0.72 : 0.42;
  return node.embedded ? 1 : 0.82;
}

function nebulaPosition(node) {
  const [x, y, z] = node.position;
  const scale = node.layer === "point"
    ? node.embedded
      ? { x: 0.5, y: 0.5, z: 0.42 }
      : { x: 0.37, y: 0.37, z: 0.3 }
    : node.embedded
      ? { x: 0.45, y: 0.45, z: 0.38 }
      : { x: 0.34, y: 0.34, z: 0.28 };
  return [x * scale.x, y * scale.y, z * scale.z];
}

function structuralDegrees(edges) {
  const degrees = new Map();
  for (const edge of edges) {
    if (edge.mode === "source") continue;
    const source = edge.source.id ?? edge.source;
    const target = edge.target.id ?? edge.target;
    degrees.set(source, (degrees.get(source) ?? 0) + 1);
    degrees.set(target, (degrees.get(target) ?? 0) + 1);
  }
  return degrees;
}

function hubScale(degree) {
  return 1 + Math.min(Math.log2(degree + 1) * 0.16, 0.72);
}

function edgeNode(edge, side) {
  return nodeMap.get(edge[side].id ?? edge[side]);
}

function basePointNodes() {
  const basePoints = reviewedPointNodes.length && !state.candidates ? reviewedPointNodes : pointNodes;
  if (state.topic === "all") return basePoints;
  return basePoints.filter((node) => node.topic === state.topic);
}

function compareCandidatePriority(left, right) {
  if (left.embedded !== right.embedded) return left.embedded ? -1 : 1;
  const degreeDelta = (pointStructuralDegrees.get(right.id) ?? 0) - (pointStructuralDegrees.get(left.id) ?? 0);
  if (degreeDelta !== 0) return degreeDelta;
  const bodyDelta = (right.body?.length ?? 0) - (left.body?.length ?? 0);
  if (bodyDelta !== 0) return bodyDelta;
  return left.title.localeCompare(right.title, "zh-Hans-CN");
}

function prioritizedVisiblePointNodes() {
  const basePoints = basePointNodes();
  if (!state.candidates) return basePoints;

  const reviewed = basePoints.filter((node) => node.status !== "candidate");
  const candidates = basePoints.filter((node) => node.status === "candidate");
  if (candidates.length <= CANDIDATE_RENDER_LIMIT) return basePoints;

  const preservedIds = new Set([
    state.selectedId,
    ...state.pathIds,
    ...state.routePreviewIds,
  ].filter(Boolean));
  const preserved = candidates.filter((node) => preservedIds.has(node.id));
  const preservedIdSet = new Set(preserved.map((node) => node.id));
  const remainingSlots = Math.max(0, CANDIDATE_RENDER_LIMIT - preserved.length);
  const prioritized = candidates
    .filter((node) => !preservedIdSet.has(node.id))
    .sort(compareCandidatePriority)
    .slice(0, remainingSlots);

  return [...reviewed, ...preserved, ...prioritized];
}

function bridgePointIds() {
  const bridgeIds = new Set();
  const bridgeSeeds = new Set(basePointNodes().map((node) => node.id));
  const formalIds = new Set(reviewedPointNodes.map((node) => node.id));

  for (const edge of data.edges) {
    if (edge.mode === "source" || (!state.semantic && edge.mode === "semantic")) continue;
    const source = edgeNode(edge, "source");
    const target = edgeNode(edge, "target");
    if (!source || !target || !formalIds.has(source.id) || !formalIds.has(target.id)) continue;
    if (source.topic === target.topic) continue;
    if (!bridgeSeeds.has(source.id) && !bridgeSeeds.has(target.id)) continue;
    bridgeIds.add(source.id);
    bridgeIds.add(target.id);
  }

  return bridgeIds;
}

function visiblePointNodes() {
  const prioritizedPoints = prioritizedVisiblePointNodes();
  if (!state.bridges) return prioritizedPoints;
  const bridgeIds = bridgePointIds();
  return prioritizedPoints.filter((node) => bridgeIds.has(node.id));
}

function visibleNodes() {
  const points = visiblePointNodes();
  if (!state.sources || state.bridges) return points;
  const sourceIds = new Set(points.map((node) => node.sourceId).filter(Boolean));
  return [...points, ...sourceNodes.filter((node) => sourceIds.has(node.id))];
}

function visibleNodeIds() {
  return new Set(visibleNodes().map((node) => node.id));
}

function activeEdges() {
  const ids = visibleNodeIds();
  return data.edges.filter((edge) =>
    ids.has(edge.source) &&
    ids.has(edge.target) &&
    (state.semantic || edge.mode !== "semantic") &&
    (!state.bridges || (
      edge.mode !== "source" &&
      edgeNode(edge, "source")?.topic !== edgeNode(edge, "target")?.topic
    )));
}

function neighborsOf(nodeId) {
  return activeEdges()
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => ({
      edge,
      node: nodeMap.get(edge.source === nodeId ? edge.target : edge.source),
    }))
    .filter((entry) => entry.node)
    .sort((left, right) => right.edge.weight - left.edge.weight);
}

function edgeKey(leftId, rightId) {
  return [leftId, rightId].sort().join("::");
}

function collectPathEdgeKeys(pathIds) {
  const keys = new Set();
  for (let index = 1; index < pathIds.length; index += 1) {
    keys.add(edgeKey(pathIds[index - 1], pathIds[index]));
  }
  return keys;
}

function edgeTraversalCost(edge) {
  if (edge.mode === "semantic") {
    const weight = Math.max(0, Math.min(1, edge.weight ?? 0));
    return 0.38 + (1 - weight) * 1.4;
  }
  if (edge.mode === "link") return 1.15;
  if (edge.mode === "source") return 2.4;
  return 1.6;
}

function normalizeSearchText(input) {
  return input.trim().toLowerCase();
}

function compareSearchPriority(left, right, normalized) {
  const leftTitle = normalizeSearchText(left.title);
  const rightTitle = normalizeSearchText(right.title);
  const leftStarts = leftTitle.startsWith(normalized);
  const rightStarts = rightTitle.startsWith(normalized);
  if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;

  const leftIndex = leftTitle.indexOf(normalized);
  const rightIndex = rightTitle.indexOf(normalized);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;

  if ((left.layer === "point") !== (right.layer === "point")) return left.layer === "point" ? -1 : 1;
  return left.title.length - right.title.length;
}

function semanticHost(endpoint) {
  return endpoint === "from" ? routeFromSemantic : routeToSemantic;
}

function setActiveRouteEndpoint(endpoint) {
  semanticSearchState.activeEndpoint = endpoint;
  if (endpoint === "from") clearSemanticSuggestions("to");
  else if (endpoint === "to") clearSemanticSuggestions("from");
  else {
    clearSemanticSuggestions("from");
    clearSemanticSuggestions("to");
  }
}

function clearSemanticSuggestions(endpoint) {
  const host = semanticHost(endpoint);
  if (!host) return;
  host.innerHTML = "";
  host.classList.add("hidden");
}

function setSemanticSuggestionsLoading(endpoint) {
  const host = semanticHost(endpoint);
  if (!host) return;
  host.innerHTML = `<span class="route-semantic-label">${endpoint === "from" ? "起点" : "终点"}：正在尝试语义候选…</span>`;
  host.classList.remove("hidden");
}

function renderSemanticSuggestions(endpoint, candidates) {
  const host = semanticHost(endpoint);
  if (!host) return;
  if (!candidates.length) {
    clearSemanticSuggestions(endpoint);
    return;
  }
  host.innerHTML = `
    <span class="route-semantic-label">${endpoint === "from" ? "起点" : "终点"}：正式点语义候选</span>
    ${candidates.map(({ node, score }) => `
      <button
        class="route-semantic-option"
        type="button"
        data-route-suggestion-endpoint="${endpoint}"
        data-node="${node.id}"
        title="${node.title} · 相似度 ${score.toFixed(2)}"
      >
        ${node.title}
      </button>
    `).join("")}
  `;
  host.classList.remove("hidden");
}

async function loadSemanticSearchIndex() {
  if (!semanticSearchState.indexPromise) {
    semanticSearchState.indexPromise = fetch("/semantic-search.json")
      .then((response) => {
        if (!response.ok) throw new Error(`semantic index ${response.status}`);
        return response.json();
      });
  }
  return semanticSearchState.indexPromise;
}

async function getSemanticExtractor(modelName) {
  if (!semanticSearchState.extractorPromise) {
    semanticSearchState.extractorPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      return pipeline("feature-extraction", modelName, { dtype: "fp32" });
    })();
  }
  return semanticSearchState.extractorPromise;
}

async function embedSemanticQuery(input, modelName) {
  const normalized = normalizeSearchText(input);
  if (semanticSearchState.queryEmbeddings.has(normalized)) {
    return semanticSearchState.queryEmbeddings.get(normalized);
  }
  const extractor = await getSemanticExtractor(modelName);
  const output = await extractor(input.trim(), {
    pooling: "mean",
    normalize: true,
  });
  const vector = Array.from(output.data ?? []);
  semanticSearchState.queryEmbeddings.set(normalized, vector);
  return vector;
}

function dotProduct(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += left[index] * right[index];
  return total;
}

async function resolveSemanticCandidates(input) {
  const normalized = normalizeSearchText(input);
  if (!normalized) return [];
  const index = await loadSemanticSearchIndex();
  const queryEmbedding = await embedSemanticQuery(input, index.vectorModel);
  const visibleIds = visibleNodeIds();

  return index.nodes
    .filter((entry) => visibleIds.has(entry.id))
    .map((entry) => ({
      node: nodeMap.get(entry.id),
      score: dotProduct(queryEmbedding, entry.embedding),
    }))
    .filter(({ node }) => node)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .filter((entry, index, ranked) => index === 0 || entry.score >= ranked[0].score - 0.08);
}

async function refreshSemanticSuggestions(endpoint, input, match) {
  const requestId = (semanticSearchState.requestIds[endpoint] ?? 0) + 1;
  semanticSearchState.requestIds[endpoint] = requestId;
  if (
    semanticSearchState.activeEndpoint !== endpoint ||
    !input.trim() ||
    match.scope === "empty" ||
    match.node
  ) {
    clearSemanticSuggestions(endpoint);
    return;
  }

  setSemanticSuggestionsLoading(endpoint);
  try {
    const candidates = await resolveSemanticCandidates(input);
    if (semanticSearchState.requestIds[endpoint] !== requestId) return;
    renderSemanticSuggestions(endpoint, candidates);
  } catch (error) {
    console.warn(`Semantic fallback failed for ${endpoint}:`, error);
    if (semanticSearchState.requestIds[endpoint] !== requestId) return;
    clearSemanticSuggestions(endpoint);
  }
}

function resolveSearchMatches(input) {
  const normalized = normalizeSearchText(input);
  if (!normalized) return { node: null, candidates: [], scope: "empty" };

  const visible = visibleNodes();
  const exactVisible = visible.filter((node) => normalizeSearchText(node.title) === normalized);
  if (exactVisible.length) {
    return {
      node: exactVisible.sort((left, right) => compareSearchPriority(left, right, normalized))[0],
      candidates: exactVisible,
      scope: "visible-exact",
    };
  }

  const fuzzyVisible = visible
    .filter((node) => normalizeSearchText(node.title).includes(normalized))
    .sort((left, right) => compareSearchPriority(left, right, normalized));
  if (fuzzyVisible.length) {
    return { node: fuzzyVisible[0], candidates: fuzzyVisible, scope: "visible-fuzzy" };
  }

  const global = data.nodes;
  const exactGlobal = global.filter((node) => normalizeSearchText(node.title) === normalized);
  if (exactGlobal.length) {
    return {
      node: exactGlobal.sort((left, right) => compareSearchPriority(left, right, normalized))[0],
      candidates: exactGlobal,
      scope: "global-exact",
    };
  }

  const fuzzyGlobal = global
    .filter((node) => normalizeSearchText(node.title).includes(normalized))
    .sort((left, right) => compareSearchPriority(left, right, normalized));
  if (fuzzyGlobal.length) {
    return { node: fuzzyGlobal[0], candidates: fuzzyGlobal, scope: "global-fuzzy" };
  }

  return { node: null, candidates: [], scope: "none" };
}

function matchSummary(match) {
  if (match.scope === "empty") return "未输入";
  if (!match.node) return "未命中";
  if (match.scope.startsWith("visible")) return match.node.title;
  return `${match.node.title}（当前筛选下不可见）`;
}

function setRouteMatchFeedback(host, label, match) {
  const labelElement = host.querySelector(".route-feedback-label");
  const valueElement = host.querySelector(".route-feedback-value");
  const accentColor = match.node ? nodeColor(match.node) : null;
  if (!labelElement || !valueElement) {
    host.textContent = `${label}：${matchSummary(match)}`;
    return;
  }

  if (accentColor) {
    host.style.setProperty("--route-feedback-accent", accentColor);
    host.style.setProperty("--route-feedback-text", withAlpha(accentColor, 0.82));
  } else {
    host.style.removeProperty("--route-feedback-accent");
    host.style.removeProperty("--route-feedback-text");
  }

  labelElement.textContent = `${label}：`;
  valueElement.textContent = matchSummary(match);
}

function routePreviewIdsFromMatches(...matches) {
  return [...new Set(
    matches
      .filter((match) => match.scope.startsWith("visible") && match.node)
      .map((match) => match.node.id),
  )];
}

function updateRouteFeedback() {
  const fromMatch = resolveSearchMatches(routeFromInput.value);
  const toMatch = resolveSearchMatches(routeToInput.value);
  setRouteMatchFeedback(routeFromMatch, "起点", fromMatch);
  setRouteMatchFeedback(routeToMatch, "终点", toMatch);
  graph?.previewRouteMatches(routePreviewIdsFromMatches(fromMatch, toMatch));
  void refreshSemanticSuggestions("from", routeFromInput.value, fromMatch);
  void refreshSemanticSuggestions("to", routeToInput.value, toMatch);
}

function updateAutocompleteDropdown(input, dropdown) {
  if (document.activeElement !== input) {
    dropdown.classList.remove("show");
    return;
  }
  const query = input.value.trim().toLowerCase();
  const optionNodes = visibleNodes()
    .filter((node) => node.layer === "point")
    .slice()
    .sort((left, right) => left.title.localeCompare(right.title, "zh-Hans-CN"));
  
  const filtered = query
    ? optionNodes.filter((node) => node.title.toLowerCase().includes(query))
    : optionNodes;
    
  if (filtered.length === 0) {
    dropdown.classList.remove("show");
    return;
  }
  
  // 限制最多显示 50 条，避免性能问题和过长的列表
  dropdown.innerHTML = filtered.slice(0, 50)
    .map((node) => `<li data-value="${node.title}">${node.title}</li>`)
    .join("");
  dropdown.classList.add("show");
}

function refreshRouteOptions() {
  updateAutocompleteDropdown(routeFromInput, document.querySelector("#route-from-options"));
  updateAutocompleteDropdown(routeToInput, document.querySelector("#route-to-options"));
  updateRouteFeedback();
}

function obsidianUrl(node) {
  const vault = encodeURIComponent("Obsidian Vault");
  const file = encodeURIComponent(node.path.replace(/\.md$/, ""));
  return `obsidian://open?vault=${vault}&file=${file}`;
}

function edgeLabel(edge) {
  if (edge.mode === "semantic") return `语义 ${edge.weight.toFixed(2)}`;
  return edge.mode === "source" ? "来源" : "结构连接";
}

function edgeStyle(edge, highlighted, hoverConnected) {
  if (highlighted) return { stroke: "#fff0a8", width: 2.8 };
  const semanticBaseWidth = semanticEdgeWidth(edge);
  if (!hoverConnected) {
    if (edge.mode === "semantic") {
      return {
        stroke: `rgba(112, 193, 255, ${0.09 + edge.weight * 0.12})`,
        width: semanticBaseWidth,
      };
    }
    return {
      stroke: edge.mode === "source" ? "rgba(170, 182, 198, 0.11)" : "rgba(166, 176, 192, 0.14)",
      width: 0.95,
    };
  }
  if (edge.mode === "semantic") {
    return {
      stroke: `rgba(112, 193, 255, ${0.28 + edge.weight * 0.52})`,
      width: semanticBaseWidth,
    };
  }
  if (edge.mode === "source") return { stroke: "rgba(255, 209, 102, 0.62)", width: 1.4 };
  return { stroke: "rgba(214, 234, 255, 0.72)", width: 1.8 };
}

function semanticEdgeWidth(edge) {
  return state.bridges ? 0.34 + edge.weight * 0.08 : 0.82 + edge.weight * 0.24;
}

function edgeTopics(edge) {
  const source = nodeMap.get(edge.source.id ?? edge.source);
  const target = nodeMap.get(edge.target.id ?? edge.target);
  return {
    source,
    target,
    crossTopic: Boolean(source && target && source.topic !== target.topic),
  };
}

function withAlpha(color, alpha) {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return color;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function stripDuplicateLeadingHeading(body, title) {
  if (!body) return body;
  const match = body.match(/^#{1,6}\s+(.+?)\s*(?:\r?\n|$)/);
  if (!match) return body;
  const heading = match[1].trim();
  if (heading !== title.trim()) return body;
  return body.slice(match[0].length).replace(/^\s+/, "");
}

function editorSurfaces() {
  return [...document.querySelectorAll("[data-editor-surface]")];
}

function renderEditor() {
  const selected = nodeMap.get(state.selectedId);
  for (const surface of editorSurfaces()) {
    const meta = surface.querySelector('[data-role="selected-meta"]');
    const noteBody = surface.querySelector('[data-role="note-body"]');
    const neighbors = surface.querySelector('[data-role="neighbors"]');
    const obsidian = surface.querySelector('[data-role="obsidian-link"]');
    if (!meta || !noteBody || !neighbors || !obsidian) continue;

    const fullscreenSurface = surface.id === "graph-fullscreen-editor";
    surface.classList.toggle("active", Boolean(
      fullscreenSurface &&
      document.fullscreenElement === graphPane &&
      selected &&
      state.fullscreenEditorOpen,
    ));

    if (!selected) {
      meta.innerHTML = "<span>当前筛选无节点</span>";
      noteBody.innerHTML = "<h3>未找到可见知识点</h3>";
      neighbors.innerHTML = "";
      obsidian.removeAttribute("href");
      continue;
    }

    const source = selected.sourceId ? nodeMap.get(selected.sourceId) : null;
    const selectedTopicMeta = topicMeta(selected.topic);
    const sourceTopicMeta = source ? topicMeta(source.topic) : null;
    meta.innerHTML = `
      <span>${selected.layer === "point" ? "知识点" : "来源"}</span>
      <span>${stageLabels[selected.stage] ?? selected.stage}</span>
      <span>${selected.scope}</span>
      <span>${selected.kind}</span>
      <span class="selected-topic-chip" style="--topic-color: ${selectedTopicMeta.color}">${selectedTopicMeta.label}</span>
      ${source ? `<button class="source-chip" style="--source-chip-accent: ${sourceTopicMeta.color}" data-node="${source.id}">源自 ${source.title}</button>` : ""}
    `;
    const cleanedBody = stripDuplicateLeadingHeading(selected.body, selected.title) || "这颗星还没有正文。";
    noteBody.innerHTML = `
      <h3>${selected.title}</h3>
      ${marked.parse(cleanedBody)}
    `;
    obsidian.href = obsidianUrl(selected);
    neighbors.innerHTML = neighborsOf(selected.id)
      .slice(0, 8)
      .map(({ edge, node }) => `
        <button data-node="${node.id}" style="--neighbor-topic-color: ${nodeColor(node)}">
          <span>${edgeLabel(edge)}</span>
          ${node.title}
        </button>
      `)
      .join("");
  }
}

function selectNode(nodeId, options = {}) {
  const { openFullscreenEditor = state.fullscreenEditorOpen } = options;
  state.selectedId = nodeId;
  state.fullscreenEditorOpen = openFullscreenEditor;
  renderEditor();
  nebula.focus(nodeId);
  graph.draw();
}

function clearRouteHighlight(options = {}) {
  const { redraw = true } = options;
  state.pathIds = [];
  state.pathEdgeKeys = new Set();
  state.pathAnimationStartedAt = 0;
  graph.syncPathAnimation();
  if (redraw) graph.draw();
}

function applyRouteHighlight() {
  const from = searchNode(routeFromInput.value);
  const to = searchNode(routeToInput.value);
  const route = from && to ? shortestPath(from.id, to.id) : null;
  state.pathIds = route?.pathIds ?? [];
  state.pathEdgeKeys = route?.pathEdgeKeys ?? new Set();
  state.pathAnimationStartedAt = state.pathIds.length > 1 ? performance.now() : 0;
  if (state.pathIds.length) selectNode(state.pathIds.at(-1), { openFullscreenEditor: false });
  graph.syncPathAnimation();
  if (state.pathIds.length) graph.fitToNodeIds(state.pathIds);
  graph.draw();
}

function setRouteEndpoint(endpoint, nodeId) {
  const node = nodeMap.get(nodeId);
  if (!node) return;
  if (endpoint === "from") {
    routeFromInput.value = node.title;
    clearRouteHighlight({ redraw: false });
  } else {
    routeToInput.value = node.title;
    if (searchNode(routeFromInput.value) && searchNode(routeToInput.value)) {
      updateRouteFeedback();
      applyRouteHighlight();
      return;
    }
  }
  updateRouteFeedback();
  graph.draw();
}

function clearNodeSelection() {
  state.selectedId = null;
  state.fullscreenEditorOpen = false;
  clearRouteHighlight({ redraw: false });
  renderEditor();
  nebula.focus(null);
  graph.draw();
}

function keepSelectionVisible() {
  if (!state.selectedId) return;
  if (visibleNodeIds().has(state.selectedId)) return;
  state.selectedId = visibleNodes()[0]?.id;
}

function refreshMap() {
  clearRouteHighlight({ redraw: false });
  keepSelectionVisible();
  refreshRouteOptions();
  nebula.update();
  graph.reset();
  renderEditor();
  nebula.focus(state.selectedId);
  graph.syncPathAnimation();
  // 使用 setTimeout 确保图谱更新、力导向图计算出大致布局后再执行缩放
  setTimeout(() => {
    graph.fitToView();
  }, 200);
}

app.addEventListener("click", (event) => {
  const routeAction = event.target.closest("[data-route-endpoint]");
  if (routeAction) {
    const routeNodeId = routeAction.dataset.node ?? routeAction.closest("[data-node]")?.dataset.node;
    if (routeNodeId) {
      setRouteEndpoint(routeAction.dataset.routeEndpoint, routeNodeId);
      graph.dismissGraphNodeActions(routeNodeId);
      return;
    }
  }
  const routeSuggestion = event.target.closest("[data-route-suggestion-endpoint][data-node]");
  if (routeSuggestion) {
    setRouteEndpoint(routeSuggestion.dataset.routeSuggestionEndpoint, routeSuggestion.dataset.node);
    return;
  }
  const button = event.target.closest("[data-node]");
  if (!button) return;
  if (!button.closest(".editor-pane") && !button.closest(".fullscreen-editor")) return;
  const nextNode = nodeMap.get(button.dataset.node);
  if (nextNode?.layer !== "point" && !state.sources) {
    state.sources = true;
    document.querySelector("#source-toggle").checked = true;
    nebula.update();
    graph.reset();
  }
  if (nextNode?.status === "candidate" && !state.candidates) {
    state.candidates = true;
    document.querySelector("#candidate-toggle").checked = true;
    nebula.update();
    graph.reset();
  }
  selectNode(button.dataset.node, { openFullscreenEditor: state.fullscreenEditorOpen });
});

routeForm.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-route-suggestion-endpoint][data-node]")) {
    event.preventDefault();
  }
});

function createNebula(container) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#06080f", 0.03);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
  camera.position.set(0, 0, 30);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const cluster = new THREE.Group();
  scene.add(cluster);
  const focusOffset = new THREE.Vector3();
  const targetFocusOffset = new THREE.Vector3();
  const panOffset = new THREE.Vector3();
  const targetPanOffset = new THREE.Vector3();
  const composedOffset = new THREE.Vector3();
  const selectionTexture = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const center = canvas.width / 2;
    if (ctx) {
      const glow = ctx.createRadialGradient(center, center, 0, center, center, center);
      glow.addColorStop(0, "rgba(255,255,255,0.95)");
      glow.addColorStop(0.18, "rgba(255,255,255,0.24)");
      glow.addColorStop(0.42, "rgba(255,255,255,0.04)");
      glow.addColorStop(0.62, "rgba(255,255,255,0)");
      glow.addColorStop(0.7, "rgba(255,255,255,0.7)");
      glow.addColorStop(0.8, "rgba(255,255,255,0.08)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  })();

  const points = data.nodes.map((node) => {
    const radius = node.layer === "point" ? 0.19 : 0.24;
    const geometry = new THREE.SphereGeometry(radius, 18, 18);
    const material = new THREE.MeshBasicMaterial({
      color: nodeColor(node),
      transparent: true,
      opacity: nodeOpacity(node),
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...nebulaPosition(node));
    mesh.userData.nodeId = node.id;
    mesh.userData.layer = node.layer;
    cluster.add(mesh);
    return mesh;
  });
  const halos = data.nodes.map((node, index) => {
    const material = new THREE.SpriteMaterial({
      map: selectionTexture,
      color: nodeColor(node),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Sprite(material);
    halo.visible = false;
    halo.position.copy(points[index].position);
    halo.renderOrder = 3;
    cluster.add(halo);
    return halo;
  });

  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(1200);
  for (let index = 0; index < starPositions.length; index += 3) {
    starPositions[index] = (Math.random() - 0.5) * 52;
    starPositions[index + 1] = (Math.random() - 0.5) * 38;
    starPositions[index + 2] = (Math.random() - 0.5) * 48;
  }
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  cluster.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({
    color: "#3f5877",
    size: 0.06,
    transparent: true,
    opacity: 0.62,
  })));

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const activePointers = new Map();
  let dragging = false;
  let rotation = { x: -0.15, y: 0.12 };
  let velocity = { x: 0, y: 0 };
  let pinchDistance = null;
  let movedDuringGesture = false;
  let zoomTarget = camera.position.z;
  let minZoom = 4.6;
  let maxZoom = 72;
  let nebulaViewInitialized = false;
  let pointerMode = "pan";
  let lastNebulaInteractionAt = Date.now();
  const autoMotionDelayMs = 3000;
  renderer.domElement.style.cursor = "grab";

  function size() {
    const rect = container.getBoundingClientRect();
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
  }

  function visibleNebulaMeshes() {
    return points.filter((mesh) => mesh.visible);
  }

  function nebulaViewMetrics() {
    const visibleMeshes = visibleNebulaMeshes();
    const rect = container.getBoundingClientRect();
    if (!visibleMeshes.length || rect.width <= 0 || rect.height <= 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const mesh of visibleMeshes) {
      minX = Math.min(minX, mesh.position.x);
      minY = Math.min(minY, mesh.position.y);
      minZ = Math.min(minZ, mesh.position.z);
      maxX = Math.max(maxX, mesh.position.x);
      maxY = Math.max(maxY, mesh.position.y);
      maxZ = Math.max(maxZ, mesh.position.z);
    }

    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    );
    const halfWidth = Math.max((maxX - minX) / 2, 0.85);
    const halfHeight = Math.max((maxY - minY) / 2, 0.85);
    const halfDepth = Math.max((maxZ - minZ) / 2, 0.7);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const fitDistance = Math.max(
      halfHeight / Math.tan(verticalFov / 2),
      halfWidth / Math.tan(horizontalFov / 2),
      halfDepth * 2.2,
    ) + 3.8;

    return {
      center,
      defaultZoom: fitDistance,
      minZoom: Math.max(4.6, fitDistance * 0.2),
      maxZoom: Math.max(72, fitDistance * 2.6),
    };
  }

  function syncNebulaView({ snap = false, preserveZoom = false } = {}) {
    const metrics = nebulaViewMetrics();
    if (!metrics) return null;
    minZoom = metrics.minZoom;
    maxZoom = metrics.maxZoom;
    zoomTarget = THREE.MathUtils.clamp(
      preserveZoom ? zoomTarget : metrics.defaultZoom,
      minZoom,
      maxZoom,
    );
    targetFocusOffset.set(-metrics.center.x, -metrics.center.y, -metrics.center.z);
    targetPanOffset.set(0, 0, 0);
    if (snap) {
      focusOffset.copy(targetFocusOffset);
      panOffset.copy(targetPanOffset);
      camera.position.z = zoomTarget;
    }
    nebulaViewInitialized = true;
    return metrics;
  }

  function nearestNebulaHit(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const maxHitDistance = 30;
    let bestMesh = null;
    let bestDistance = maxHitDistance;

    for (const mesh of points) {
      if (!mesh.visible) continue;
      const projected = mesh.position.clone().project(camera);
      if (projected.z < -1 || projected.z > 1) continue;

      const screenX = (projected.x * 0.5 + 0.5) * rect.width;
      const screenY = (-projected.y * 0.5 + 0.5) * rect.height;
      const distance = Math.hypot(screenX - localX, screenY - localY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMesh = mesh;
      }
    }

    return bestMesh;
  }

  function pickAtClientPoint(clientX, clientY, { clearIfBlank = false } = {}) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(points)[0]?.object ?? nearestNebulaHit(clientX, clientY);
    if (hit) {
      if (hit.userData.nodeId === state.selectedId) return true;
      markNebulaInteraction();
      if (state.pathIds.length) clearRouteHighlight({ redraw: false });
      selectNode(hit.userData.nodeId, { openFullscreenEditor: false });
      return true;
    }
    if (clearIfBlank && state.selectedId) {
      markNebulaInteraction();
      clearNodeSelection();
      return true;
    }
    return false;
  }

  function pick(event) {
    pickAtClientPoint(event.clientX, event.clientY, { clearIfBlank: true });
  }

  function zoomBy(delta) {
    zoomTarget = THREE.MathUtils.clamp(zoomTarget + delta, minZoom, maxZoom);
  }

  function pointerGap() {
    if (activePointers.size < 2) return null;
    const [first, second] = [...activePointers.values()];
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function panByPixels(dx, dy) {
    const rect = container.getBoundingClientRect();
    if (rect.height <= 0) return;
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const unitsPerPixel = visibleHeight / rect.height;
    targetPanOffset.x += dx * unitsPerPixel;
    targetPanOffset.y -= dy * unitsPerPixel;
  }

  function markNebulaInteraction({ resetVelocity = true } = {}) {
    lastNebulaInteractionAt = Date.now();
    if (resetVelocity) {
      velocity.x = 0;
      velocity.y = 0;
    }
  }

  function applyNebulaSelectionStyles(selectedId, degrees, visibleIds = null) {
    for (let index = 0; index < points.length; index += 1) {
      const mesh = points[index];
      const halo = halos[index];
      const node = data.nodes[index];
      const nodeId = mesh.userData.nodeId;
      const visible = visibleIds ? visibleIds.has(nodeId) : mesh.visible;
      const baseScale = hubScale(degrees.get(nodeId) ?? 0);
      const isSelected = Boolean(selectedId) && nodeId === selectedId && visible;
      const baseColor = new THREE.Color(nodeColor(node));

      mesh.visible = visible;
      mesh.scale.setScalar(isSelected ? baseScale * 1.78 : baseScale);
      mesh.material.color.copy(
        isSelected ? baseColor.clone().lerp(new THREE.Color("#ffffff"), 0.24) : baseColor,
      );
      mesh.material.opacity = isSelected ? Math.min(1, nodeOpacity(node) + 0.28) : nodeOpacity(node);

      halo.visible = isSelected;
      if (!isSelected) continue;
      halo.material.color.copy(baseColor);
      halo.material.opacity = node.layer === "point" ? 0.8 : 0.66;
      halo.scale.setScalar((node.layer === "point" ? 1.18 : 1.42) * baseScale);
    }
  }

  function endPointer(event) {
    const endedMode = pointerMode;
    const singlePointerTap = activePointers.size === 1 && !movedDuringGesture && pinchDistance === null && endedMode !== "select";
    activePointers.delete(event.pointerId);
    renderer.domElement.releasePointerCapture?.(event.pointerId);
    if (activePointers.size >= 2) {
      pinchDistance = pointerGap();
      return;
    }
    if (activePointers.size === 1) {
      dragging = true;
      pinchDistance = null;
      movedDuringGesture = true;
      velocity = { x: 0, y: 0 };
      return;
    }
    dragging = false;
    pinchDistance = null;
    pointerMode = "pan";
    renderer.domElement.style.cursor = "grab";
    if (singlePointerTap) pick(event);
    movedDuringGesture = false;
  }

  renderer.domElement.addEventListener("pointerdown", (event) => {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    renderer.domElement.setPointerCapture?.(event.pointerId);
    if (activePointers.size === 1) {
      markNebulaInteraction();
      dragging = true;
      pointerMode = event.altKey ? "rotate" : event.metaKey ? "select" : "pan";
      movedDuringGesture = false;
      pinchDistance = null;
      renderer.domElement.style.cursor = pointerMode === "rotate" ? "grabbing" : pointerMode === "select" ? "crosshair" : "move";
      if (pointerMode === "select") pickAtClientPoint(event.clientX, event.clientY);
      return;
    }
    dragging = false;
    pinchDistance = pointerGap();
    movedDuringGesture = true;
    pointerMode = "pan";
  });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!activePointers.has(event.pointerId)) return;
    const previous = activePointers.get(event.pointerId);
    const next = { x: event.clientX, y: event.clientY };
    activePointers.set(event.pointerId, next);

    if (activePointers.size >= 2) {
      const nextGap = pointerGap();
      if (pinchDistance !== null && nextGap !== null) {
        const gapDelta = pinchDistance - nextGap;
        if (Math.abs(gapDelta) > 0.5) {
          zoomBy(gapDelta * 0.03);
        }
      }
      pinchDistance = nextGap;
      movedDuringGesture = true;
      return;
    }

    if (!dragging) return;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (Math.hypot(dx, dy) > 1.5) movedDuringGesture = true;
    if (pointerMode === "rotate") {
      markNebulaInteraction({ resetVelocity: false });
      rotation.y += dx * 0.0036;
      rotation.x += dy * 0.0032;
      rotation.x = THREE.MathUtils.clamp(rotation.x, -0.78, 0.78);
    } else if (pointerMode === "select") {
      pickAtClientPoint(event.clientX, event.clientY);
    } else {
      markNebulaInteraction();
      panByPixels(dx, dy);
    }
  });
  renderer.domElement.addEventListener("pointerup", endPointer);
  renderer.domElement.addEventListener("pointercancel", endPointer);
  renderer.domElement.addEventListener("wheel", (event) => {
    markNebulaInteraction();
    zoomBy(event.deltaY * 0.012);
  }, { passive: true });

  function animate() {
    const shouldAutoDrift = !dragging &&
      activePointers.size === 0 &&
      Date.now() - lastNebulaInteractionAt > autoMotionDelayMs;
    if (shouldAutoDrift) {
      rotation.y += 0.00062;
    } else {
      velocity.x = 0;
      velocity.y = 0;
    }
    cluster.rotation.x += (rotation.x - cluster.rotation.x) * 0.09;
    cluster.rotation.y += (rotation.y - cluster.rotation.y) * 0.09;
    camera.position.z += (zoomTarget - camera.position.z) * 0.16;
    focusOffset.lerp(targetFocusOffset, 0.08);
    panOffset.lerp(targetPanOffset, 0.14);
    composedOffset.copy(focusOffset).add(panOffset);
    cluster.position.lerp(composedOffset, 0.12);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  size();
  animate();
  new ResizeObserver(size).observe(container);

  return {
    focus(nodeId) {
      const degrees = structuralDegrees(activeEdges());
      applyNebulaSelectionStyles(nodeId, degrees);
    },
    update() {
      const ids = visibleNodeIds();
      const degrees = structuralDegrees(activeEdges());
      applyNebulaSelectionStyles(state.selectedId, degrees, ids);
      syncNebulaView({ snap: !nebulaViewInitialized, preserveZoom: true });
    },
  };
}

function createGraph(canvas) {
  const context = canvas.getContext("2d");
  const graphNodeActions = document.querySelector("#graph-node-actions");
  const graphNodes = data.nodes.map((node) => ({ ...node }));
  const graphNodeMap = new Map(graphNodes.map((node) => [node.id, node]));
  let renderNodes = [];
  let renderEdges = [];
  let renderDegrees = new Map();
  let globalLabelIds = new Set();
  let hubNodeIds = new Set();
  let lowDetailEdgeKeys = new Set();
  let midDetailEdgeKeys = new Set();
  let simulation;
  let hoveredId = null;
  let graphActivated = false;
  let selectionPinned = false;
  let viewport = { scale: 1, offsetX: 0, offsetY: 0 };
  let gesture = null;
  let isSimulationSettled = false; // 用于标记力导向图是否已经处于静止状态
  let labelAnchorIndexes = new Map();
  let flashFrame = null;
  let pathAnimationFrame = null;
  let viewportAnimationFrame = null;
  let dismissedNodeActionsId = null;

  function hideGraphNodeActions() {
    graphNodeActions.classList.add("hidden");
    graphNodeActions.removeAttribute("data-node");
  }

  function dismissGraphNodeActions(nodeId = state.selectedId) {
    dismissedNodeActionsId = nodeId ?? null;
    hideGraphNodeActions();
  }

  function syncGraphNodeActions(node) {
    if (
      !graphNodeActions ||
      !node ||
      node.layer !== "point" ||
      !visibleNodeIds().has(node.id) ||
      gesture?.mode === "drag-node" ||
      dismissedNodeActionsId === node.id
    ) {
      hideGraphNodeActions();
      return;
    }

    const paneRect = graphPane.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const point = screenPoint(node.x, node.y);
    const nodeRadius = screenRadius(node, renderDegrees);
    const accentColor = nodeColor(node);
    const actionWidth = 66;
    const actionHeight = 34;
    const gap = Math.max(7, nodeRadius + 4);
    const canvasLeftBound = canvasRect.left - paneRect.left + 12;
    const canvasRightBound = canvasRect.right - paneRect.left - actionWidth - 12;
    const canvasTopBound = canvasRect.top - paneRect.top + 12;
    const canvasBottomBound = canvasRect.bottom - paneRect.top - actionHeight - 12;
    const relativeX = canvasRect.left - paneRect.left + point.x;
    const relativeY = canvasRect.top - paneRect.top + point.y;
    const preferRight = relativeX + gap + actionWidth < canvasRect.right - paneRect.left - 12;
    const preferAbove = relativeY - gap - actionHeight > canvasTopBound;
    const left = preferRight
      ? relativeX + gap
      : relativeX - actionWidth - gap;
    const top = preferAbove
      ? relativeY - gap - actionHeight
      : relativeY + gap - 8;

    graphNodeActions.style.left = `${Math.min(canvasRightBound, Math.max(canvasLeftBound, left))}px`;
    graphNodeActions.style.top = `${Math.min(canvasBottomBound, Math.max(canvasTopBound, top))}px`;
    graphNodeActions.style.setProperty("--node-action-accent", accentColor);
    graphNodeActions.style.setProperty("--node-action-accent-soft", withAlpha(accentColor, 0.2));
    graphNodeActions.style.setProperty("--node-action-accent-glow", withAlpha(accentColor, 0.26));
    graphNodeActions.style.setProperty("--node-action-accent-border", withAlpha(accentColor, 0.34));
    graphNodeActions.dataset.node = node.id;
    graphNodeActions.classList.remove("hidden");
  }

  function screenPoint(x, y) {
    return {
      x: x * viewport.scale + viewport.offsetX,
      y: y * viewport.scale + viewport.offsetY,
    };
  }

  function worldPoint(x, y) {
    return {
      x: (x - viewport.offsetX) / viewport.scale,
      y: (y - viewport.offsetY) / viewport.scale,
    };
  }

  function zoomRadiusFactor() {
    if (viewport.scale <= 1) return Math.max(0.22, viewport.scale);
    if (viewport.scale <= 1.3) return 1 + (viewport.scale - 1) * 0.32;
    if (viewport.scale <= 1.7) return 1.096 + (viewport.scale - 1.3) * 0.08;
    return 1.13;
  }

  function minViewportScale() {
    if (renderNodes.length >= 320) return 0.16;
    if (renderNodes.length >= 220) return 0.2;
    if (renderNodes.length >= 140) return 0.26;
    if (renderNodes.length >= 90) return 0.34;
    return 0.55;
  }

  function showAllLabelsAtCurrentZoom() {
    return viewport.scale >= 1.6;
  }

  function hideDefaultLabelsAtCurrentZoom() {
    return viewport.scale <= 0.8;
  }

  function screenRadius(node, degrees) {
    return selectedRadius(node, degrees) * zoomRadiusFactor();
  }

  function edgeDisplayScore(edge) {
    const { crossTopic } = edgeTopics(edge);
    const crossTopicBoost = crossTopic ? 0.24 : 0;
    if (edge.mode === "semantic") return 1.08 + (edge.weight ?? 0) * 1.42 + crossTopicBoost;
    if (edge.mode === "link") return 0.94 + crossTopicBoost;
    if (edge.mode === "source") return 0.26;
    return 0.42;
  }

  function buildEdgeVisibilitySet(perNodeLimit) {
    const counts = new Map();
    const keys = new Set();
    const ranked = [...renderEdges].sort((left, right) => edgeDisplayScore(right) - edgeDisplayScore(left));

    for (const edge of ranked) {
      const sourceId = edge.source.id ?? edge.source;
      const targetId = edge.target.id ?? edge.target;
      const sourceCount = counts.get(sourceId) ?? 0;
      const targetCount = counts.get(targetId) ?? 0;
      if (sourceCount >= perNodeLimit && targetCount >= perNodeLimit) continue;
      keys.add(edgeKey(sourceId, targetId));
      counts.set(sourceId, sourceCount + 1);
      counts.set(targetId, targetCount + 1);
    }

    return keys;
  }

  function edgeVisibilityKeysForCurrentZoom() {
    if (viewport.scale <= 0.92) return lowDetailEdgeKeys;
    if (viewport.scale <= 1.28) return midDetailEdgeKeys;
    return null;
  }

  function curveDirectionForEdge(edge) {
    const key = edgeKey(edge.source.id ?? edge.source, edge.target.id ?? edge.target);
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
      hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
    }
    return hash % 2 === 0 ? 1 : -1;
  }

  function edgeCurveControlPoint(sourcePoint, targetPoint, edge, intensity = 1) {
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;
    const distance = Math.hypot(dx, dy);
    if (!distance) {
      return {
        x: (sourcePoint.x + targetPoint.x) / 2,
        y: (sourcePoint.y + targetPoint.y) / 2,
      };
    }

    const direction = curveDirectionForEdge(edge);
    const normalX = -dy / distance;
    const normalY = dx / distance;
    const modeFactor = edge.mode === "semantic" ? 1.06 : edge.mode === "link" ? 0.82 : 0.54;
    const offset = Math.min(30, 8 + distance * 0.045) * modeFactor * intensity * direction;

    return {
      x: (sourcePoint.x + targetPoint.x) / 2 + normalX * offset,
      y: (sourcePoint.y + targetPoint.y) / 2 + normalY * offset,
    };
  }

  function nodeAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const point = { x: clientX - rect.left, y: clientY - rect.top };
    return renderNodes.find((node) => {
      const screen = screenPoint(node.x, node.y);
      return Math.hypot(screen.x - point.x, screen.y - point.y) < screenRadius(node, renderDegrees) + 8;
    });
  }

  function stopViewportAnimation() {
    if (!viewportAnimationFrame) return;
    cancelAnimationFrame(viewportAnimationFrame);
    viewportAnimationFrame = null;
  }

  function animateViewportTo(targetViewport, duration = 320) {
    stopViewportAnimation();
    const startViewport = { ...viewport };
    const startAt = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - startAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      viewport.scale = startViewport.scale + (targetViewport.scale - startViewport.scale) * eased;
      viewport.offsetX = startViewport.offsetX + (targetViewport.offsetX - startViewport.offsetX) * eased;
      viewport.offsetY = startViewport.offsetY + (targetViewport.offsetY - startViewport.offsetY) * eased;
      draw();
      if (progress >= 1) {
        viewportAnimationFrame = null;
        return;
      }
      viewportAnimationFrame = requestAnimationFrame(tick);
    };

    viewportAnimationFrame = requestAnimationFrame(tick);
  }

  function fitToNodeIds(nodeIds) {
    const targets = nodeIds
      .map((nodeId) => graphNodeMap.get(nodeId))
      .filter((node) => node && Number.isFinite(node.x) && Number.isFinite(node.y));
    if (!targets.length) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const padding = Math.max(20, Math.min(rect.width, rect.height) * 0.08);
    const xs = targets.map((node) => node.x);
    const ys = targets.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const boundsWidth = Math.max(1, maxX - minX);
    const boundsHeight = Math.max(1, maxY - minY);
    const scaleX = (rect.width - padding * 2) / boundsWidth;
    const scaleY = (rect.height - padding * 2) / boundsHeight;
    const targetScale = THREE.MathUtils.clamp(
      targets.length === 1 ? 1.65 : Math.min(scaleX, scaleY),
      minViewportScale(),
      2.8,
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    animateViewportTo({
      scale: targetScale,
      offsetX: rect.width / 2 - centerX * targetScale,
      offsetY: rect.height / 2 - centerY * targetScale,
    });
  }

  function updateHover(nodeId) {
    if (selectionPinned && nodeId !== null) return;
    if (hoveredId === nodeId) return;
    hoveredId = nodeId;
    canvas.style.cursor = hoveredId ? "pointer" : "grab";
    draw();
  }

  function shouldShowLabel(node, selectedNeighborIds, hoverFocusIds, pathFocusIds) {
    if (pathFocusIds?.size) return pathFocusIds.has(node.id) || node.id === hoveredId;
    if (showAllLabelsAtCurrentZoom()) return true;
    const active = (selectionPinned && node.id === state.selectedId) || state.pathIds.includes(node.id);
    if (hideDefaultLabelsAtCurrentZoom()) {
      if (active) return true;
      // 缩放到很小且触发悬停时，只显示被悬停的中心节点标签，不显示它周围一圈所有邻居的标签
      if (hoveredId === node.id) return true;
      return false;
    }
    if (active) return true;
    if (hoverFocusIds?.has(node.id)) return true;
    if (selectedNeighborIds.has(node.id)) return true;
    return globalLabelIds.has(node.id);
  }

  function labelFontSize(font) {
    return Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 11);
  }

  function boxOverlapArea(left, right) {
    const x = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
    const y = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
    return x * y;
  }

  function candidateLabelBoxes(label) {
    const gap = Math.max(9, label.radius + 6);
    const centerX = label.point.x;
    const centerY = label.point.y;
    const { width, height } = label;
    const positions = [
      { x: centerX - width / 2, y: centerY + gap, align: "center" },
      { x: centerX - width / 2, y: centerY - gap - height, align: "center" },
      { x: centerX + gap, y: centerY - height / 2, align: "left" },
      { x: centerX - gap - width, y: centerY - height / 2, align: "right" },
      { x: centerX + gap * 0.72, y: centerY + gap * 0.72, align: "left" },
      { x: centerX - gap * 0.72 - width, y: centerY + gap * 0.72, align: "right" },
      { x: centerX + gap * 0.72, y: centerY - gap * 0.72 - height, align: "left" },
      { x: centerX - gap * 0.72 - width, y: centerY - gap * 0.72 - height, align: "right" },
      { x: centerX - width / 2, y: centerY + gap * 1.85, align: "center" },
      { x: centerX - width / 2, y: centerY - gap * 1.85 - height, align: "center" },
    ];

    return positions.map((position, index) => {
      const padded = {
        x: position.x - 4,
        y: position.y - 2,
        width: width + 8,
        height: height + 4,
      };
      return {
        ...position,
        index,
        padded,
        score: index * 0.01,
      };
    });
  }

  function nodeObstacleBoxes(nodes) {
    return nodes.map((node) => {
      const point = screenPoint(node.x, node.y);
      const radius = screenRadius(node, renderDegrees) + 7;
      return {
        x: point.x - radius,
        y: point.y - radius,
        width: radius * 2,
        height: radius * 2,
      };
    });
  }

  function drawGraphLabels(labels, obstacles) {
    const placed = [];
    const forceAll = showAllLabelsAtCurrentZoom();
    const sorted = [...labels].sort((left, right) => right.priority - left.priority);
    // 当正在交互（拖拽/平移）或者模拟引擎还没完全静止时，都保持标签位置绝对锁定
    const isLabelsLocked = gesture !== null || !isSimulationSettled;

    for (const label of sorted) {
      const previousIndex = labelAnchorIndexes.get(label.node.id);
      
      let best;
      const candidatesList = candidateLabelBoxes(label);
      if (isLabelsLocked && previousIndex !== undefined) {
        best = candidatesList.find(c => c.index === previousIndex) || candidatesList[0];
      } else {
        const candidates = candidatesList
          .map((candidate) => ({
            ...candidate,
            score: candidate.score +
              placed.reduce((sum, box) => sum + boxOverlapArea(candidate.padded, box) * 2.5, 0) +
              obstacles.reduce((sum, box) => sum + boxOverlapArea(candidate.padded, box) * 5.2, 0) +
              (candidate.index === previousIndex ? -120 : 0),
          }))
          .sort((left, right) => left.score - right.score);
        best = candidates[0];
      }

      if (!best || (!forceAll && best.score > 0 && label.priority < 700 && !isLabelsLocked)) continue;
      labelAnchorIndexes.set(label.node.id, best.index);

      const labelCenter = {
        x: best.x + label.width / 2,
        y: best.y + label.height / 2,
      };
      const distance = Math.hypot(labelCenter.x - label.point.x, labelCenter.y - label.point.y);
      if (distance > label.radius + 18) {
        context.beginPath();
        context.strokeStyle = withAlpha(nodeColor(label.node), Math.min(0.34, label.alpha * 0.38));
        context.lineWidth = 0.7;
        context.moveTo(label.point.x, label.point.y);
        context.lineTo(labelCenter.x, labelCenter.y);
        context.stroke();
      }

      context.globalAlpha = label.alpha;
      context.fillStyle = label.fillStyle;
      context.font = label.font;
      context.textAlign = best.align;
      context.textBaseline = "top";
      if (label.shadow) {
        context.shadowBlur = 10;
        context.shadowColor = "rgba(247, 250, 252, 0.38)";
      }
      const textX = best.align === "center"
        ? best.x + label.width / 2
        : best.align === "right"
          ? best.x + label.width
          : best.x;
      context.fillText(label.node.title, textX, best.y);
      context.shadowBlur = 0;
      context.globalAlpha = 1;
      placed.push(best.padded);
    }

    context.textAlign = "left";
    context.textBaseline = "alphabetic";
  }

  function refreshGlobalLabels() {
    const ids = new Set();
    const degreeRanked = [...renderNodes]
      .filter((node) => node.layer === "point" && node.status !== "candidate")
      .sort((left, right) => (renderDegrees.get(right.id) ?? 0) - (renderDegrees.get(left.id) ?? 0))
      .slice(0, renderNodes.length > 220 ? 3 : 4);

    for (const node of degreeRanked) ids.add(node.id);

    const bridgeRanked = [];
    for (const node of renderNodes) {
      if (node.layer !== "point" || node.status === "candidate" || ids.has(node.id)) continue;
      const neighbors = renderEdges
        .filter((edge) => edge.source === node.id || edge.target === node.id)
        .map((edge) => graphNodeMap.get(edge.source === node.id ? edge.target : edge.source))
        .filter(Boolean);
      const crossTopicCount = neighbors.filter((neighbor) => neighbor.topic !== node.topic).length;
      if (!crossTopicCount) continue;
      bridgeRanked.push({
        id: node.id,
        score: crossTopicCount * 100 + (renderDegrees.get(node.id) ?? 0),
      });
    }

    bridgeRanked
      .sort((left, right) => right.score - left.score)
      .slice(0, renderNodes.length > 220 ? 2 : 3)
      .forEach((entry) => ids.add(entry.id));

    if (state.selectedId) {
      ids.add(state.selectedId);
    }

    globalLabelIds = ids;
  }

  function refreshHubNodes() {
    const ranked = renderNodes
      .filter((node) => node.layer === "point" && node.status !== "candidate")
      .map((node) => ({
        id: node.id,
        degree: renderDegrees.get(node.id) ?? 0,
      }))
      .filter((entry) => entry.degree > 0)
      .sort((left, right) => right.degree - left.degree);

    if (!ranked.length) {
      hubNodeIds = new Set();
      return;
    }

    const maxHubCount = renderNodes.length > 160 ? 4 : renderNodes.length > 80 ? 3 : 2;
    const threshold = Math.max(5, ranked[0].degree - 2);
    const nextHubIds = ranked
      .filter((entry, index) => index < maxHubCount && entry.degree >= threshold)
      .map((entry) => entry.id);

    hubNodeIds = new Set(nextHubIds.length ? nextHubIds : [ranked[0].id]);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    if (!viewport.offsetX && !viewport.offsetY) {
      viewport.offsetX = 0;
      viewport.offsetY = 0;
    }
    reset();
    syncGraphNodeActions(graphNodeMap.get(state.selectedId));
  }

  function fitToView() {
    fitToNodeIds(renderNodes.map(node => node.id));
  }

  function reset() {
    simulation?.stop();
    isSimulationSettled = false;
    const rect = canvas.getBoundingClientRect();
    renderNodes = activeGraphNodes();
    renderEdges = activeEdges();
    renderDegrees = structuralDegrees(renderEdges);
    labelAnchorIndexes = new Map();
    lowDetailEdgeKeys = buildEdgeVisibilitySet(renderNodes.length > 220 ? 2 : 3);
    midDetailEdgeKeys = buildEdgeVisibilitySet(renderNodes.length > 220 ? 4 : 5);
    refreshGlobalLabels();
    refreshHubNodes();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    simulation = forceSimulation(renderNodes)
      .alphaDecay(renderNodes.length > 420 ? 0.065 : 0.032)
      .alphaMin(0.01)
      .force("charge", forceManyBody().strength((node) => {
        if (!node.embedded) return node.layer === "point" ? -180 : -135;
        if (node.layer !== "point") return -235;
        return -320;
      }))
      .force("center", forceCenter(centerX, centerY))
      .force("x", forceX(centerX).strength((node) => node.embedded ? 0.012 : 0.036))
      .force("y", forceY(centerY).strength((node) => node.embedded ? 0.012 : 0.036))
      .force("collision", forceCollide().radius((node) => {
        const base = selectedRadius(node, renderDegrees);
        return base + (node.embedded ? 20 : 11);
      }))
      .force("link", forceLink(renderEdges.map((edge) => ({ ...edge })))
        .id((node) => node.id)
        .distance((edge) => {
          const { crossTopic } = edgeTopics(edge);
          if (edge.mode === "semantic") {
            return crossTopic
              ? 86 + (1 - edge.weight) * 84
              : 118 + (1 - edge.weight) * 124;
          }
          return crossTopic ? 74 : 86;
        })
        .strength((edge) => {
          const { crossTopic } = edgeTopics(edge);
          if (edge.mode === "semantic") return crossTopic ? 0.44 : 0.2;
          return crossTopic ? 0.78 : 0.64;
        }))
      .on("tick", () => {
        isSimulationSettled = false;
        draw();
      })
      .on("end", () => {
        isSimulationSettled = true;
        draw();
      });
  }

  function selectedRadius(node, degrees) {
    const base = node.layer === "point" ? 4.35 : 6.5;
    const degree = degrees.get(node.id) ?? 0;
    const hubBonus = Math.min(
      Math.log2(degree + 1) * 2.7 + Math.sqrt(degree) * 0.58,
      11.6,
    );
    const bridgeBonus = globalLabelIds.has(node.id) ? 0.95 : 0;
    const motherBonus = hubNodeIds.has(node.id) ? 4.4 : 0;
    return base + hubBonus + bridgeBonus + motherBonus + (node.id === state.selectedId ? 4.1 : 0);
  }

  function activeGraphNodes() {
    const ids = visibleNodeIds();
    return graphNodes.filter((node) => ids.has(node.id));
  }

  function previewRouteMatches(nodeIds) {
    const nextIds = [...new Set(nodeIds.filter((nodeId) => visibleNodeIds().has(nodeId)))];
    const previousKey = state.routePreviewIds.slice().sort().join("|");
    const nextKey = nextIds.slice().sort().join("|");
    if (previousKey === nextKey) return;

    state.routePreviewIds = nextIds;
    state.routeFlashUntil = nextIds.length ? Date.now() + 900 : 0;

    if (flashFrame) {
      cancelAnimationFrame(flashFrame);
      flashFrame = null;
    }

    if (!nextIds.length) {
      draw();
      return;
    }

    const animate = () => {
      draw();
      if (Date.now() >= state.routeFlashUntil) {
        state.routePreviewIds = [];
        state.routeFlashUntil = 0;
        flashFrame = null;
        draw();
        return;
      }
      flashFrame = requestAnimationFrame(animate);
    };

    animate();
  }

  function drawPathFlow(now) {
    const segmentCount = state.pathIds.length - 1;
    if (segmentCount < 1) return;
    const duration = Math.max(1800, segmentCount * 520);
    const progress = ((now - state.pathAnimationStartedAt) % duration) / duration * segmentCount;
    const segmentIndex = Math.min(segmentCount - 1, Math.floor(progress));
    const segmentProgress = progress - segmentIndex;
    const scaleBoost = Math.max(0.92, Math.min(viewport.scale, 1.5));

    context.save();
    context.lineCap = "round";

    for (let index = 0; index < segmentCount; index += 1) {
      const fromNode = graphNodeMap.get(state.pathIds[index]);
      const toNode = graphNodeMap.get(state.pathIds[index + 1]);
      if (!fromNode || !toNode) continue;

      const from = screenPoint(fromNode.x, fromNode.y);
      const to = screenPoint(toNode.x, toNode.y);
      const completed = index < segmentIndex;
      const active = index === segmentIndex;
      if (!completed && !active) continue;

      const endProgress = completed ? 1 : segmentProgress;
      const endX = from.x + (to.x - from.x) * endProgress;
      const endY = from.y + (to.y - from.y) * endProgress;

      // Use a cooler, lighter signal sweep so the path reads clearly without overpowering the graph.
      context.beginPath();
      context.strokeStyle = completed
        ? "rgba(110, 214, 255, 0.34)"
        : "rgba(110, 214, 255, 0.68)";
      context.lineWidth = (completed ? 4.2 : 5.4) * scaleBoost;
      context.shadowBlur = completed ? 12 : 18;
      context.shadowColor = completed
        ? "rgba(96, 206, 255, 0.38)"
        : "rgba(130, 228, 255, 0.72)";
      context.moveTo(from.x, from.y);
      context.lineTo(endX, endY);
      context.stroke();

      context.beginPath();
      context.strokeStyle = completed
        ? "rgba(198, 244, 255, 0.86)"
        : "rgba(232, 251, 255, 0.98)";
      context.lineWidth = (completed ? 2.1 : 2.9) * scaleBoost;
      context.shadowBlur = completed ? 5 : 10;
      context.shadowColor = completed
        ? "rgba(188, 240, 255, 0.42)"
        : "rgba(224, 249, 255, 0.84)";
      context.moveTo(from.x, from.y);
      context.lineTo(endX, endY);
      context.stroke();
    }

    const currentFrom = graphNodeMap.get(state.pathIds[segmentIndex]);
    const currentTo = graphNodeMap.get(state.pathIds[segmentIndex + 1]);
    if (currentFrom && currentTo) {
      const from = screenPoint(currentFrom.x, currentFrom.y);
      const to = screenPoint(currentTo.x, currentTo.y);
      const headX = from.x + (to.x - from.x) * segmentProgress;
      const headY = from.y + (to.y - from.y) * segmentProgress;
      context.beginPath();
      context.fillStyle = "rgba(110, 214, 255, 0.22)";
      context.shadowBlur = 18;
      context.shadowColor = "rgba(120, 226, 255, 0.78)";
      context.arc(headX, headY, 7.2 * scaleBoost, 0, Math.PI * 2);
      context.fill();

      context.beginPath();
      context.fillStyle = "rgba(238, 251, 255, 0.98)";
      context.shadowBlur = 10;
      context.shadowColor = "rgba(228, 249, 255, 0.88)";
      context.arc(headX, headY, 3.6 * scaleBoost, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function syncPathAnimation() {
    if (pathAnimationFrame) {
      cancelAnimationFrame(pathAnimationFrame);
      pathAnimationFrame = null;
    }

    if (state.pathIds.length < 2) {
      draw();
      return;
    }

    const animate = () => {
      if (state.pathIds.length < 2) {
        pathAnimationFrame = null;
        draw();
        return;
      }
      draw();
      pathAnimationFrame = requestAnimationFrame(animate);
    };

    pathAnimationFrame = requestAnimationFrame(animate);
  }

  function draw() {
    const now = performance.now();
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    const pathFocusIds = state.pathIds.length > 1 ? new Set(state.pathIds) : null;
    const flashingRouteIds = Date.now() < state.routeFlashUntil ? new Set(state.routePreviewIds) : null;
    const selectedNeighborIds = new Set(neighborsOf(state.selectedId).map(({ node: neighbor }) => neighbor.id));
    const hoverNeighborIds = hoveredId ? new Set(neighborsOf(hoveredId).map(({ node: neighbor }) => neighbor.id)) : new Set();
    const hoverFocusIds = hoveredId ? new Set([hoveredId, ...hoverNeighborIds]) : null;
    const selectedFocusIds = state.selectedId ? new Set([state.selectedId, ...selectedNeighborIds]) : new Set();
    const interactionFocusIds = pathFocusIds ?? hoverFocusIds ?? (selectionPinned && state.selectedId ? selectedFocusIds : null);
    const lodVisibleEdgeKeys = edgeVisibilityKeysForCurrentZoom();
    const selectedColor = nodeMap.get(state.selectedId) ? nodeColor(nodeMap.get(state.selectedId)) : "#8bcaff";
    const hoveredColor = hoveredId && nodeMap.get(hoveredId) ? nodeColor(nodeMap.get(hoveredId)) : null;
    for (const edge of renderEdges) {
      const source = graphNodeMap.get(edge.source.id ?? edge.source);
      const target = graphNodeMap.get(edge.target.id ?? edge.target);
      if (!source || !target) continue;
      const highlighted = state.pathEdgeKeys.has(edgeKey(source.id, target.id));
      const hoverConnected = hoveredId ? (source.id === hoveredId || target.id === hoveredId) : false;
      const selectedConnected = state.selectedId ? (source.id === state.selectedId || target.id === state.selectedId) : false;
      const focusRelevant = highlighted ||
        hoverConnected ||
        selectedConnected ||
        Boolean(interactionFocusIds && interactionFocusIds.has(source.id) && interactionFocusIds.has(target.id));
      if (lodVisibleEdgeKeys && !focusRelevant && !lodVisibleEdgeKeys.has(edgeKey(source.id, target.id))) continue;
      const semanticBaseWidth = edge.mode === "semantic" ? semanticEdgeWidth(edge) : null;
      let style = edgeStyle(edge, highlighted, hoverConnected);
      if (!highlighted && pathFocusIds) {
        style = {
          stroke: pathFocusIds.has(source.id) || pathFocusIds.has(target.id)
            ? "rgba(145, 155, 168, 0.12)"
            : "rgba(145, 155, 168, 0.06)",
          width: pathFocusIds.has(source.id) || pathFocusIds.has(target.id) ? 0.9 : 0.75,
        };
      }
      if (!pathFocusIds && !highlighted && selectedConnected && graphActivated) {
        style = {
          stroke: withAlpha(selectedColor, hoveredId && !hoverConnected ? 0.16 : 0.74),
          width: edge.mode === "semantic" ? semanticBaseWidth : hoveredId && !hoverConnected ? 1.25 : 2,
        };
      }
      if (!pathFocusIds && !highlighted && hoverConnected && hoveredColor) {
        style = {
          stroke: withAlpha(hoveredColor, 0.88),
          width: edge.mode === "semantic" ? semanticBaseWidth : 2.1,
        };
      }
      if (!pathFocusIds && !highlighted && interactionFocusIds) {
        const relatedToFocus = interactionFocusIds.has(source.id) && interactionFocusIds.has(target.id);
        if (!relatedToFocus && !hoverConnected && !selectedConnected) {
          style = {
            stroke: edge.mode === "source" ? "rgba(145, 155, 168, 0.09)" : "rgba(145, 155, 168, 0.12)",
            width: 0.88,
          };
        }
      }
      if (!pathFocusIds && !highlighted && hoveredId && !hoverConnected && !selectedConnected) {
        style = {
          stroke: edge.mode === "source" ? "rgba(145, 155, 168, 0.08)" : "rgba(145, 155, 168, 0.1)",
          width: 0.82,
        };
      }
      const sourcePoint = screenPoint(source.x, source.y);
      const targetPoint = screenPoint(target.x, target.y);
      context.strokeStyle = style.stroke;
      context.lineWidth = style.width * Math.max(0.8, Math.min(viewport.scale, 1.35));
      context.beginPath();
      context.moveTo(sourcePoint.x, sourcePoint.y);
      const shouldCurve = !highlighted && !pathFocusIds;
      if (shouldCurve) {
        const curveIntensity = focusRelevant ? 0.45 : 0.72;
        const control = edgeCurveControlPoint(sourcePoint, targetPoint, edge, curveIntensity);
        context.quadraticCurveTo(control.x, control.y, targetPoint.x, targetPoint.y);
      } else {
        context.lineTo(targetPoint.x, targetPoint.y);
      }
      context.stroke();
    }

    if (pathFocusIds && state.pathAnimationStartedAt) {
      drawPathFlow(now);
    }

    const selectedRenderNode = state.selectedId ? renderNodes.find((node) => node.id === state.selectedId) ?? null : null;
    const orderedNodes = selectedRenderNode
      ? [...renderNodes.filter((node) => node.id !== selectedRenderNode.id), selectedRenderNode]
      : renderNodes;
    const labelEntries = [];
    for (const node of orderedNodes) {
      const active = node.id === state.selectedId || state.pathIds.includes(node.id) || node.id === hoveredId;
      const baseRadius = screenRadius(node, renderDegrees);
      const point = screenPoint(node.x, node.y);
      const pathMatched = pathFocusIds?.has(node.id) ?? false;
      const focusMatched = interactionFocusIds ? interactionFocusIds.has(node.id) : false;
      const dimmedByFocus = Boolean(interactionFocusIds && !focusMatched);
      const selectedRelated = selectedFocusIds.has(node.id);
      const isSelected = node.id === state.selectedId;
      const isHub = hubNodeIds.has(node.id);
      const hoverScale = pathFocusIds
        ? pathMatched ? 1.08 : 0.84
        : hoverFocusIds
        ? focusMatched
          ? (node.id === hoveredId ? 1.14 : 1.08)
          : 0.88
        : 1;
      const radius = baseRadius * hoverScale * (isSelected ? 1.12 : 1);
      const opacity = isSelected
        ? 1
        : pathFocusIds
        ? pathMatched ? nodeOpacity(node) : nodeOpacity(node) * 0.12
        : dimmedByFocus
        ? nodeOpacity(node) * (selectedRelated ? 0.5 : 0.32)
        : globalLabelIds.has(node.id)
          ? Math.min(1, nodeOpacity(node) * 1.04)
          : nodeOpacity(node) * 0.88;
      const globalFocus = globalLabelIds.has(node.id);
      
      // 添加母节点多边形绘制逻辑
      context.globalAlpha = opacity;
      context.beginPath();
      if (node.layer !== "point") {
        // 母节点使用多边形（六边形）
        const sides = 6;
        const angleOffset = Math.PI / 2; // 调整角度让多边形立起来
        for (let i = 0; i < sides; i++) {
          const angle = angleOffset + (i * 2 * Math.PI / sides);
          const px = point.x + radius * Math.cos(angle);
          const py = point.y + radius * Math.sin(angle);
          if (i === 0) {
            context.moveTo(px, py);
          } else {
            context.lineTo(px, py);
          }
        }
        context.closePath();
      } else {
        // 子节点依然使用圆形
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      }
      
      context.fillStyle = nodeColor(node);
      context.shadowBlur = pathFocusIds
        ? pathMatched ? 20 : 0
        : interactionFocusIds
        ? focusMatched
          ? (isSelected ? 30 : node.id === hoveredId ? 24 : 14)
          : 0
        : active
          ? (isSelected ? 30 : 22)
          : isHub
            ? 36
          : globalFocus
            ? 11
          : node.status === "candidate"
            ? 2
            : 4;
      context.shadowColor = isHub
        ? withAlpha(nodeColor(node), 0.88)
        : nodeColor(node);
      context.fill();
      
      // 母节点额外画一圈发光边框以凸显其异形轮廓
      if (node.layer !== "point") {
        context.lineWidth = 1.2;
        context.strokeStyle = "rgba(255, 255, 255, 0.4)";
        context.stroke();
      }

      if (isSelected) {
        context.beginPath();
        context.globalAlpha = 0.95;
        context.lineWidth = 2.2;
        context.strokeStyle = "rgba(247, 250, 252, 0.92)";
        if (node.layer !== "point") {
          const sides = 6;
          const angleOffset = Math.PI / 2;
          for (let i = 0; i < sides; i++) {
            const angle = angleOffset + (i * 2 * Math.PI / sides);
            const px = point.x + (radius + 4) * Math.cos(angle);
            const py = point.y + (radius + 4) * Math.sin(angle);
            if (i === 0) {
              context.moveTo(px, py);
            } else {
              context.lineTo(px, py);
            }
          }
          context.closePath();
        } else {
          context.arc(point.x, point.y, radius + 3.6, 0, Math.PI * 2);
        }
        context.stroke();
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
      if (flashingRouteIds?.has(node.id)) {
        const flashProgress = 1 - Math.max(0, state.routeFlashUntil - Date.now()) / 900;
        const pulseRadius = radius + 4 + flashProgress * 13;
        const pulseAlpha = 0.88 - flashProgress * 0.72;
        context.beginPath();
        context.strokeStyle = withAlpha(nodeColor(node), Math.max(0.16, pulseAlpha));
        context.lineWidth = 2.1;
        context.arc(point.x, point.y, pulseRadius, 0, Math.PI * 2);
        context.stroke();
      }
      if (!shouldShowLabel(node, selectedNeighborIds, hoverFocusIds, pathFocusIds)) continue;
      const isNeighbor = selectedNeighborIds.has(node.id);
      const isGlobal = globalLabelIds.has(node.id);
      const labelAlpha = isSelected
        ? 1
        : pathFocusIds
        ? pathMatched ? 0.96 : 0.05
        : dimmedByFocus ? (selectedRelated ? 0.26 : 0.12) : focusMatched ? 0.98 : isGlobal ? 0.66 : 0.56;
      const labelFillStyle = isSelected
        ? "#ffffff"
        : active
        ? "#f7fafc"
        : focusMatched
          ? "rgba(248, 251, 255, 0.98)"
          : isNeighbor
            ? "rgba(242, 248, 255, 0.95)"
            : isGlobal
              ? "rgba(222, 233, 246, 0.8)"
              : "rgba(210, 223, 239, 0.66)";
      const labelFont = isSelected
        ? "600 13px Inter, sans-serif"
        : active
        ? "600 12.5px Inter, sans-serif"
        : focusMatched
          ? "600 11.5px Inter, sans-serif"
          : isNeighbor
            ? "600 11.5px Inter, sans-serif"
            : isGlobal
              ? "500 10px Inter, sans-serif"
              : "10px Inter, sans-serif";
      context.font = labelFont;
      const fontSize = labelFontSize(labelFont);
      const width = context.measureText(node.title).width;
      const priority = (isSelected ? 5000 : 0) +
        (node.id === hoveredId ? 3600 : 0) +
        (pathMatched ? 3200 : 0) +
        (focusMatched ? 1600 : 0) +
        (isNeighbor ? 900 : 0) +
        (isGlobal ? 600 : 0) +
        (renderDegrees.get(node.id) ?? 0);
      labelEntries.push({
        node,
        point,
        radius,
        width,
        height: fontSize + 4,
        alpha: labelAlpha,
        fillStyle: labelFillStyle,
        font: labelFont,
        priority,
        shadow: isSelected,
      });
    }
    drawGraphLabels(labelEntries, nodeObstacleBoxes(orderedNodes));
    syncGraphNodeActions(selectedRenderNode);
  }

  function endGesture(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    canvas.releasePointerCapture?.(event.pointerId);
    if (gesture.mode === "drag-node" && gesture.node) {
      gesture.node.fx = null;
      gesture.node.fy = null;
      simulation?.alphaTarget(0);
    }
    if (!gesture.moved) {
      const hit = nodeAt(event.clientX, event.clientY);
      if (hit) {
        if (state.pathIds.length) clearRouteHighlight({ redraw: false });
        dismissedNodeActionsId = null;
        selectionPinned = true;
        updateHover(null);
        selectNode(hit.id, { openFullscreenEditor: document.fullscreenElement === graphPane });
      } else if (selectionPinned || state.pathIds.length) {
        selectionPinned = false;
        updateHover(null);
        clearNodeSelection();
      }
    }
    gesture = null;
    if (!selectionPinned) {
      updateHover(nodeAt(event.clientX, event.clientY)?.id ?? null);
    }
  }

  function wheelZoom(event) {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const world = worldPoint(cursorX, cursorY);
    const factor = Math.exp(-event.deltaY * 0.0012);
    const nextScale = THREE.MathUtils.clamp(viewport.scale * factor, minViewportScale(), 2.4);
    viewport.scale = nextScale;
    viewport.offsetX = cursorX - world.x * viewport.scale;
    viewport.offsetY = cursorY - world.y * viewport.scale;
    draw();
  }

  function pointerMove(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) {
      if (selectionPinned) {
        if (hoveredId !== null) updateHover(null);
        return;
      }
      updateHover(nodeAt(event.clientX, event.clientY)?.id ?? null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const dx = localX - gesture.lastX;
    const dy = localY - gesture.lastY;
    if (Math.hypot(dx, dy) > 2) gesture.moved = true;
    if (gesture.mode === "drag-node" && gesture.node) {
      const world = worldPoint(localX, localY);
      gesture.node.fx = world.x;
      gesture.node.fy = world.y;
      simulation?.alphaTarget(0.18).restart();
    } else if (gesture.mode === "pan") {
      viewport.offsetX += dx;
      viewport.offsetY += dy;
      draw();
    }
    gesture.lastX = localX;
    gesture.lastY = localY;
  }

  function pointerDown(event) {
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const hit = nodeAt(event.clientX, event.clientY);
    const canDragHit = hit && (
      state.pathIds.length
        ? state.pathIds.includes(hit.id)
        : state.selectedId
          ? hit.id === state.selectedId
          : true
    );
    canvas.setPointerCapture?.(event.pointerId);
    graphActivated = true;
    if (hit && canDragHit) {
      hideGraphNodeActions();
      const world = worldPoint(localX, localY);
      hit.fx = world.x;
      hit.fy = world.y;
      isSimulationSettled = false;
      simulation?.alphaTarget(0.18).restart();
      gesture = {
        mode: "drag-node",
        pointerId: event.pointerId,
        node: hit,
        lastX: localX,
        lastY: localY,
        moved: false,
      };
      canvas.style.cursor = "grabbing";
      return;
    }
    gesture = {
      mode: "pan",
      pointerId: event.pointerId,
      lastX: localX,
      lastY: localY,
      moved: false,
    };
    canvas.style.cursor = "grabbing";
  }

  function leaveCanvas() {
    if (gesture) return;
    if (selectionPinned) return;
    updateHover(null);
  }

  function clearInteractionState() {
    stopViewportAnimation();
    selectionPinned = false;
    hoveredId = null;
    graphActivated = false;
    gesture = null;
    canvas.style.cursor = "grab";
    hideGraphNodeActions();
    draw();
  }

  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", endGesture);
  canvas.addEventListener("pointercancel", endGesture);
  canvas.addEventListener("pointerleave", leaveCanvas);
  canvas.addEventListener("wheel", wheelZoom, { passive: false });
  resize();
  new ResizeObserver(resize).observe(canvas);

  return {
    draw,
    reset,
    previewRouteMatches,
    syncPathAnimation,
    clearInteractionState,
    fitToNodeIds,
    dismissGraphNodeActions,
    fitToView,
  };
}

function searchNode(input) {
  const match = resolveSearchMatches(input);
  return match.scope.startsWith("visible") ? match.node : null;
}

function shortestPath(fromId, toId) {
  if (!fromId || !toId) return { pathIds: [], pathEdgeKeys: new Set(), totalCost: Infinity };
  if (fromId === toId) return { pathIds: [fromId], pathEdgeKeys: new Set(), totalCost: 0 };

  const adjacency = new Map();
  for (const edge of activeEdges()) {
    const cost = edgeTraversalCost(edge);
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source).push({ nodeId: edge.target, cost });
    adjacency.get(edge.target).push({ nodeId: edge.source, cost });
  }

  const pending = new Set([fromId, ...adjacency.keys()]);
  const distances = new Map([[fromId, 0]]);
  const previous = new Map();

  while (pending.size) {
    let currentId = null;
    let currentDistance = Infinity;
    for (const nodeId of pending) {
      const candidate = distances.get(nodeId) ?? Infinity;
      if (candidate < currentDistance) {
        currentDistance = candidate;
        currentId = nodeId;
      }
    }

    if (currentId === null || currentDistance === Infinity) break;
    pending.delete(currentId);
    if (currentId === toId) break;

    for (const neighbor of adjacency.get(currentId) ?? []) {
      if (!pending.has(neighbor.nodeId)) continue;
      const nextDistance = currentDistance + neighbor.cost;
      if (nextDistance >= (distances.get(neighbor.nodeId) ?? Infinity)) continue;
      distances.set(neighbor.nodeId, nextDistance);
      previous.set(neighbor.nodeId, currentId);
    }
  }

  if (!distances.has(toId)) return { pathIds: [], pathEdgeKeys: new Set(), totalCost: Infinity };

  const pathIds = [];
  let cursor = toId;
  while (cursor) {
    pathIds.unshift(cursor);
    if (cursor === fromId) break;
    cursor = previous.get(cursor);
  }

  if (pathIds[0] !== fromId) return { pathIds: [], pathEdgeKeys: new Set(), totalCost: Infinity };
  return {
    pathIds,
    pathEdgeKeys: collectPathEdgeKeys(pathIds),
    totalCost: distances.get(toId) ?? Infinity,
  };
}

function resetStructuralToggleSelection() {
  state.selectedId = null;
  state.fullscreenEditorOpen = false;
  state.pathIds = [];
  state.pathEdgeKeys = new Set();
  state.pathAnimationStartedAt = 0;
  graph?.clearInteractionState();
}

document.querySelector("#semantic-toggle").addEventListener("change", (event) => {
  state.semantic = event.target.checked;
  resetStructuralToggleSelection();
  refreshMap();
});

document.querySelector("#source-toggle").addEventListener("change", (event) => {
  state.sources = event.target.checked;
  if (state.sources && state.bridges) {
    state.bridges = false;
    document.querySelector("#bridge-toggle").checked = false;
    resetStructuralToggleSelection();
  }
  refreshMap();
});

document.querySelector("#candidate-toggle").addEventListener("change", (event) => {
  state.candidates = event.target.checked;
  refreshMap();
});

document.querySelector("#bridge-toggle").addEventListener("change", (event) => {
  state.bridges = event.target.checked;
  resetStructuralToggleSelection();
  refreshMap();
});

const graphPane = document.querySelector(".graph-pane");
const focusBar = document.querySelector(".focus-bar");
const graphFullscreenButton = document.querySelector("#graph-fullscreen");
const topicSelect = document.querySelector("#topic-select");

function syncTopicControls() {
  topicSelect.value = state.topic;
  const activeTopicMeta = state.topic === "all" ? null : topicMeta(state.topic);
  if (activeTopicMeta) {
    topicSelect.style.setProperty("--topic-select-accent", activeTopicMeta.color);
  } else {
    topicSelect.style.removeProperty("--topic-select-accent");
  }
  for (const filter of document.querySelectorAll("#topic-filters [data-topic]")) {
    filter.classList.toggle("active", filter.dataset.topic === state.topic);
  }
  for (const chip of document.querySelectorAll("#nebula-topic-strip .nebula-topic-chip")) {
    chip.classList.toggle("active", chip.dataset.topic === state.topic);
  }
}

function syncGraphFullscreenButton() {
  const active = document.fullscreenElement === graphPane;
  graphFullscreenButton.textContent = active ? "退出全屏" : "全屏";
  graphFullscreenButton.setAttribute("aria-pressed", active ? "true" : "false");
}

graphFullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement === graphPane) {
      await document.exitFullscreen();
    } else {
      await graphPane.requestFullscreen();
    }
  } catch (error) {
    console.error("Failed to toggle graph fullscreen", error);
  }
});

function bindHorizontalScroll(surface, enabled = () => true) {
  surface?.addEventListener("wheel", (event) => {
    if (!enabled()) return;
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    if (event.deltaY === 0) return;
    surface.scrollLeft += event.deltaY;
    event.preventDefault();
  }, { passive: false });
}

function bindDragScroll(surface, enabled = () => true) {
  if (!surface) return;

  let dragging = false;
  let pointerId = null;
  let startX = 0;
  let startScrollLeft = 0;
  let captureTarget = null;
  let hasMoved = false;

  surface.addEventListener("pointerdown", (event) => {
    if (!enabled()) return;
    if (event.button !== 0) return;
    dragging = true;
    hasMoved = false;
    pointerId = event.pointerId;
    startX = event.clientX;
    startScrollLeft = surface.scrollLeft;
    captureTarget = event.target;
    try {
      captureTarget.setPointerCapture?.(event.pointerId);
    } catch (e) {}
    surface.classList.add("dragging");
  });

  surface.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const deltaX = event.clientX - startX;
    if (Math.abs(deltaX) > 3) hasMoved = true;
    surface.scrollLeft = startScrollLeft - deltaX;
    if (hasMoved) event.preventDefault();
  });

  function endDrag(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    try {
      if (captureTarget) captureTarget.releasePointerCapture?.(event.pointerId);
    } catch (e) {}
    captureTarget = null;
    surface.classList.remove("dragging");
  }

  surface.addEventListener("pointerup", endDrag);
  surface.addEventListener("pointercancel", endDrag);
  
  surface.addEventListener("click", (event) => {
    if (hasMoved) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { capture: true });
}

bindHorizontalScroll(focusBar, () => document.fullscreenElement === graphPane);
const topicStrip = document.querySelector("#nebula-topic-strip");
const topicScroll = document.querySelector("#nebula-topic-scroll");
bindHorizontalScroll(topicScroll);
bindDragScroll(topicScroll);

// 使星云左侧的分类带也能点击过滤
topicStrip?.addEventListener("click", (event) => {
  const chip = event.target.closest(".nebula-topic-chip");
  if (!chip) return;
  state.topic = state.topic === chip.dataset.topic ? "all" : chip.dataset.topic;
  syncTopicControls();
  refreshMap();
});

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement !== graphPane) {
    state.fullscreenEditorOpen = false;
  }
  syncGraphFullscreenButton();
  renderEditor();
  // 全屏或退出全屏时画布尺寸发生了突变，等 DOM 重排完后自动调整视角
  setTimeout(() => {
    graph.fitToView();
  }, 100);
});
syncGraphFullscreenButton();

document.querySelector("#close-fullscreen-editor")?.addEventListener("click", () => {
  state.fullscreenEditorOpen = false;
  renderEditor();
});

topicSelect.addEventListener("change", (event) => {
  state.topic = event.target.value;
  syncTopicControls();
  refreshMap();
});

document.querySelector("#topic-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  state.topic = button.dataset.topic;
  syncTopicControls();
  refreshMap();
});

for (const input of [routeFromInput, routeToInput]) {
  input.addEventListener("input", () => {
    refreshRouteOptions();
  });
  input.addEventListener("change", () => {
    refreshRouteOptions();
  });
}

document.querySelector("#route-from-options").addEventListener("mousedown", (event) => {
  const li = event.target.closest("li");
  if (!li) return;
  routeFromInput.value = li.dataset.value;
  refreshRouteOptions();
  routeFromInput.blur();
});

document.querySelector("#route-to-options").addEventListener("mousedown", (event) => {
  const li = event.target.closest("li");
  if (!li) return;
  routeToInput.value = li.dataset.value;
  refreshRouteOptions();
  routeToInput.blur();
});

routeFromInput.addEventListener("focus", () => {
  setActiveRouteEndpoint("from");
  refreshRouteOptions();
});

routeToInput.addEventListener("focus", () => {
  setActiveRouteEndpoint("to");
  refreshRouteOptions();
});

for (const input of [routeFromInput, routeToInput]) {
  input.addEventListener("blur", () => {
    requestAnimationFrame(() => {
      refreshRouteOptions();
      if (document.activeElement === routeFromInput) {
        setActiveRouteEndpoint("from");
        return;
      }
      if (document.activeElement === routeToInput) {
        setActiveRouteEndpoint("to");
        return;
      }
      setActiveRouteEndpoint(null);
    });
  });
}

routeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyRouteHighlight();
});

nebula = createNebula(document.querySelector("#nebula"));
graph = createGraph(document.querySelector("#graph"));
nebula.update();
renderEditor();
nebula.focus(state.selectedId);
syncTopicControls();
refreshRouteOptions();

// 项目首次进入时，等力导向图布局初步成型后自适应缩放居中
setTimeout(() => {
  graph.fitToView();
}, 300);
