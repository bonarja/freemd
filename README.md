# freemd

**English** · [Español](./README.es.md)

A local-first markdown notes app that lives on your machine. One command and you're editing notes in your browser — clean dark UI, live preview, per-note image attachments, and one-click export to PDF or Word.

```bash
npx freemd
```

That's it: it creates `~/openmd` if it doesn't exist, starts a local server at [http://localhost:5813](http://localhost:5813) and opens your browser.

## Why freemd

- **Your notes are plain files.** Everything is markdown on your own disk, no accounts, no cloud, no lock-in. Back it up, sync it, grep it, own it.
- **Notes can carry their own images.** Each note is a folder, so screenshots and attachments travel with the note and keep working if you move it.
- **Built for writing.** Distraction-free editor, rendered preview, or both side by side.
- **Export that looks right.** Clean, light-themed PDF and `.docx` with syntax-highlighted code and embedded images.

## Requirements

Node.js 18 or newer. That's all.

## Usage

```bash
npx freemd [options]
```

| Option | Description |
| --- | --- |
| `-p, --port <n>` | Server port (default `5813`) |
| `-d, --dir <path>` | Notes folder (default `~/openmd`) |
| `-H, --host <addr>` | Listen on another interface; with no value binds `0.0.0.0` (whole local network) |
| `--no-open` | Don't open the browser automatically |
| `-v, --version` | Print version |
| `-h, --help` | Show help |

`OPENMD_PORT`, `OPENMD_DIR` and `OPENMD_HOST` environment variables work too.

### Access from other devices

```bash
npx freemd --host
```

This exposes the app on your local network and prints the URL for each network interface, e.g. `http://192.168.1.20:5813` — open it from your phone, tablet or another computer.

> ⚠️ There is no authentication. Anything on your network can reach the app, so only use `--host` on networks you trust.

## How your notes are stored

Everything lives in one folder (by default `~/openmd`):

```
~/openmd
├── trip-to-japan-md
│   ├── index.md        ← the note itself
│   ├── day-1.png       ← its images and attachments
│   └── receipt.pdf
├── recipes-md
│   └── index.md
├── work                ← a plain folder (organize as you like)
│   └── notes-md
│       └── index.md
└── readme.md           ← loose .md files work too
```

- A **note** is a folder ending in `-md` whose content lives in `index.md`. The `-md` folder is what keeps the note's images next to its text — you'll never see the folder in the app; you just see `trip-to-japan.md`.
- Reference images with normal relative paths: `![map](./day-1.png)`.

## The app

- **Sidebar** — your notes and folders. Hover any item to rename (✏️) or delete (🗑); the toolbar icons create notes, folders and upload attachments to the current note.
- **Editor with three view modes** — *Edición* (raw markdown), *Split* (editor and rendered preview side by side, scroll-synced), *Vista* (rendered preview). Code blocks get syntax highlighting.
- **Resources panel** — a collapsible panel on the right showing the current note's images as thumbnails. Click one to insert its markdown at the cursor; hover to delete it.
- **Paste images** — copy a screenshot or image and press `Cmd/Ctrl + V` anywhere in the note: it's saved into the note's folder and its markdown inserted at the cursor.
- **Autosave** — changes save automatically 1.2 s after you stop typing (or instantly with `Cmd/Ctrl + S`).
- **Export** — one click to download the current note as **PDF** or **Word (.docx)**: light-themed, syntax-highlighted code, embedded images, named after the note (`recipes.pdf`, never `index.pdf`). Unsaved changes are saved first.

## Development

```bash
pnpm install
pnpm dev:server   # API server on :5813 (no browser)
pnpm dev          # Vite dev server on :5174 with HMR
pnpm build        # production build → dist/
pnpm start        # serve the production build
```

Built with **Svelte 5** and **Vite** on the front, plain **Node + Express** on the back. Markdown rendering by **markdown-it** with **highlight.js**; exports by **pdfkit** and **docx**. See [`AGENTS.md`](./AGENTS.md) for architecture notes.

## License

[MIT](./LICENSE)
