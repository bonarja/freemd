# AGENTS.md — freemd

Markdown notes editor: Node/Express CLI (`bin/openmd.js`, intended use `npx freemd`) serving a Svelte 5 + Vite frontend from `dist/`. Notes live in `~/freemd`, created on boot (override: `--dir` / `FREEMD_DIR`); a legacy `~/openmd` folder is auto-renamed to `~/freemd` on first boot when the latter doesn't exist.

## Commands

- **Use pnpm, never npm** (project constraint).
- `pnpm build` — Vite build → `dist/`. Required before `pnpm start` and before publishing: the server only serves static files from `dist/` and returns an error page without it.
- `pnpm dev:server` — API server on `:5813` with `--no-open`. Pair with `pnpm dev` (Vite on `:5174`, proxies `/api` and `/media` to `:5813`).
- No test suite or linter. Verify changes with `pnpm build` plus manual curl calls against a scratch root: `node bin/openmd.js --dir <tmp> --port 5899 --no-open`. To eyeball exported PDF/docx on macOS: `qlmanage -t -s 900 -o <dir> <file>`.
- pnpm v11 blocks esbuild's postinstall; `pnpm-workspace.yaml` whitelists it (`onlyBuiltDependencies`). If a fresh install fails with `ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds --all`.

## Data model (core invariant)

- A **note** is a directory ending in `-md` containing `index.md` plus its resources (images, attachments). Directories without `-md` are plain folders.
- `/api/tree` presents notes as files: `name: "nota.md"`, `path: "nota-md/index.md"`, and `dir: "nota-md"` (the folder). Delete/rename/upload-targeting must use `dir` for notes, `path` for everything else. `index.md` is never shown to the user.
- `slug()` keeps Unicode letters — folder names can contain accents (`bitácora-md`).

## Server invariants (`server/`)

- Only `bin/`, `server/`, `dist/` publish (`files` in package.json). Server code ships as plain ESM, unbundled — run `pnpm build` before `pnpm publish`.
- `PUT /api/file` must NOT `mkdir` parents: saving to a renamed/deleted path must 404, otherwise an in-flight autosave resurrects the old note folder.
- `GET /api/file` self-heals a missing `index.md` inside a `*-md` folder by creating it with the note title.
- `POST /api/folder` with a name ending in `-md` must also create that note's `index.md`.
- Visible names/crumbs come from `fileLabels()`; export titles follow the same rule so `recetas-md/index.md` exports as `recetas.pdf` / `recetas.docx` (never `index.pdf`).
- Every endpoint taking a user path goes through `safeJoin()` (traversal guard). Resources are served via `/media/`.

## Frontend (`src/`)

- Svelte 5 **runes** (`$state`, `$derived`, `$props`, `$bindable`, `$effect`) — no Svelte 4 `export let` or stores.
- `src/lib/markdown.js` resolves relative image srcs against the note dir (`env.base`) into `/media/...` URLs; the resources panel inserts URL-encoded filenames (`mi%20foto.png`).
- App theme is One Dark (CSS variables in `src/app.css`); exports are deliberately light-themed (atom-one-light palette in `server/export/highlight.js`).

## pdfkit gotchas (`server/export/to-pdf.js`)

- `.text()` ignores a `color` option: call `doc.fillColor()` before every run, or text inherits the last fill state (this caused invisible "ghost" headings after code blocks).
- `.text(str, x, y)` mutates `doc.x`; reset it to the margin after code blocks, or the next block starts at the last code segment's x.
