本目录是可提交到 git 的 Obsidian 内容快照。

如果你准备把项目分享给别人，建议只保留示例数据或已脱敏的数据集，避免把私人笔记正文、路径、截图、来源材料等同步进来。

你可以直接运行：

- `npm run data`：基于本目录生成 `public/vault-data.json`
- `npm run dev`：启动前端查看图谱

如需从你自己的 Obsidian Vault 同步内容到这里，再运行：

- `OBSIDIAN_VAULT="/absolute/path/to/your/vault" npm run content:sync`
