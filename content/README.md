# Content Source Layout

This project keeps a git-friendly snapshot of the Obsidian knowledge source in `content/vault/`.

Included:
- `content/vault/Knowledge Points/` for knowledge-point markdown sources
- root-level map markdown files such as `*核心知识层.md`, `*子图.md`, `知识地图正式总图.md`, and `双链.md`

Excluded:
- `.obsidian/`
- `.smart-env/`
- `Sources/`
- import indexes, review summaries, canvases, and other non-essential or privacy-sensitive files

Commands:
- `npm run content:sync` refreshes `content/vault/` from the local Obsidian Vault
- `npm run data` builds `public/vault-data.json` from `content/vault/` by default
- `npm run map:refresh` runs `content:sync -> data`
- `npm run all` runs `map:refresh` and then starts the local dev server

Build behavior:
- If `content/vault/` exists, the build script uses it as the markdown source
- If the local Obsidian Vault still exists on this machine, embeddings are reused from the local `.smart-env/multi` directory when available
- On other machines without the local Vault, the project still builds from `content/vault/`, but semantic embeddings may be missing until vectors are regenerated
