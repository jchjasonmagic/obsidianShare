# O-DataMap

一个把 Obsidian 知识点、地图结构和前端图谱展示串起来的知识工程工作台。

## 项目定位
- `Obsidian Vault`：日常写知识点、改正文、维护双链
- `content/vault`：项目内可提交、可同步的知识源快照
- `public/vault-data.json`：前端运行时读取的构建产物
- `src/main.js`：前端主要交互与图谱渲染逻辑

这个项目的核心不是单纯展示页面，而是形成一条稳定闭环：

`Obsidian Markdown -> content/vault -> build-vault-data.mjs -> vault-data.json -> 前端图谱`

## 目录说明
- `content/vault/Knowledge Points/`：正式知识点 Markdown 源
- `content/vault/*.md`：核心知识层、子图、总图、`双链.md`
- `scripts/sync-vault-content.mjs`：把本地 Obsidian Vault 中适合纳入 git 的内容同步到 `content/vault`
- `scripts/build-vault-data.mjs`：从 `content/vault` 构建 `public/vault-data.json`
- `public/vault-data.json`：前端直接读取的静态快照

## 常用命令
```bash
npm run content:sync
npm run data
npm run map:refresh
npm run all
npm run dev
```

- `npm run content:sync`
  - 从本地 Obsidian Vault 同步知识源到 `content/vault`
- `npm run data`
  - 从 `content/vault` 重建 `public/vault-data.json`
- `npm run map:refresh`
  - 一键执行 `content:sync -> data`
- `npm run all`
  - 一键执行 `map:refresh` 并启动本地开发预览
- `npm run dev`
  - 直接基于当前数据启动本地开发预览
- `npm run build`
  - 运行完整构建，适合提交前校验

## 标准操作手册
### 日常编辑流程
1. 在 Obsidian 中修改知识点 Markdown。
2. 在项目目录执行：

```bash
npm run map:refresh
```

3. 本地预览：

```bash
npm run all
```

4. 刷新页面检查图谱效果。
5. 确认无问题后再提交 git。

### 最小闭环
```bash
npm run all
```

## 正式知识点编辑规范
- 默认修改源 Markdown，而不是直接修改 `public/vault-data.json`
- 尽量保留标题不变，除非明确要重命名
- 保持 frontmatter 结构稳定，例如 `topic`、`map_stage`、`map_kind`、`status`
- 保留 `## 关联` 及其后面的链接结构
- 正文尽量控制在 `2 到 4` 段
- 每个正式点尽量只负责一个核心判断
- 避免把“原则 + 流程 + 例外 + 示例”混在一个点里

## 什么内容应该进 git
- `content/vault/Knowledge Points/`
- `content/vault` 根目录下的核心地图文件
- 与同步和构建相关的脚本
- 前端展示代码与构建产物

## 什么内容不要进 git
- `Sources/`
- `.obsidian/`
- `.smart-env/`
- 向量缓存
- 原始对话与敏感材料
- 临时备份目录
- 中间导入索引、审核结论、临时分析文件

## 构建逻辑
- 构建脚本优先读取 `content/vault`
- 如果当前机器上还能访问本地 Obsidian Vault 的 `.smart-env/multi`，构建时会尽量复用本地 embeddings
- 在其他电脑上即使没有本地 iCloud Vault，也可以直接基于 `content/vault` 构建
- 如果没有向量数据，图谱仍可构建，但语义边和 embedding 相关效果会减少

## 提交前检查
先检查工作区：

```bash
git status --short
```

再做完整构建校验：

```bash
npm run build
```

确认无误后再提交：

```bash
git add .
git commit -m "Update knowledge sources and rebuild vault data"
git push
```

## 推荐工作方式
### 模式 A：内容维护
- 在 Obsidian 中改知识点
- `npm run all`
- 检查图谱效果后提交 git

### 模式 B：前端调图
- 修改 `src/main.js` 或 `src/styles.css`
- `npm run dev`
- 观察交互、布局、路径、星云和编辑面行为

## 多设备使用建议
- 主机继续在 Obsidian 中写源 Markdown
- 改完后运行 `npm run map:refresh`
- 提交 git
- 其他电脑 clone 项目后，已经可以拿到 `content/vault` 中的知识源快照
- 其他电脑可以直接运行：

```bash
npm run all
npm run dev

## 备注
- 如果你长期同时维护前端和知识源，建议在 Trae 中保存一个工作区：
  - 一个目录是 `O-datamap`
  - 一个目录是 Obsidian Vault
- 这样可以同时改 Markdown、跑构建、看页面效果。
