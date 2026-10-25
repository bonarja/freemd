import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportMarkdown } from './export/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

const TEXT_EXTS = new Set([
  '.md', '.markdown', '.mdown', '.txt', '.text', '.json', '.jsonc', '.js', '.mjs', '.cjs',
  '.ts', '.tsx', '.jsx', '.css', '.scss', '.less', '.html', '.htm', '.xml', '.svg',
  '.yml', '.yaml', '.toml', '.ini', '.csv', '.tsv', '.sh', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.sql', '.gitignore', '.env'
]);

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);

const IGNORED = new Set(['node_modules', '.git', '.DS_Store']);
const MAX_DEPTH = 6;

const isNoteName = (name) => name.endsWith('-md');

function safeJoin(root, rel = '') {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    const error = new Error('Path not allowed');
    error.status = 400;
    throw error;
  }
  return abs;
}

function slug(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toRelUrl(relPath) {
  return relPath.split('/').map(encodeURIComponent).join('/');
}

// Nombre visible de un archivo: las notas (index.md dentro de carpeta *-md)
// se muestran como `nota.md`; `dir` es la ruta de carpetas para el breadcrumb.
function fileLabels(rel) {
  const parts = rel.split('/');
  const name = parts[parts.length - 1];
  const parent = parts.length >= 2 ? parts[parts.length - 2] : '';
  if (/^index\.md$/i.test(name) && parent.endsWith('-md')) {
    return {
      name: `${parent.slice(0, -3)}.md`,
      dir: parts.length >= 3 ? `${parts.slice(0, -2).join('/')}/` : ''
    };
  }
  return {
    name,
    dir: parts.length >= 2 ? `${parts.slice(0, -1).join('/')}/` : ''
  };
}

async function buildTree(absDir, relDir = '', depth = 0) {
  const entries = await fsp.readdir(absDir, { withFileTypes: true });
  const nodes = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED.has(entry.name)) continue;
    const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (isNoteName(entry.name)) {
        nodes.push({
          name: `${entry.name.slice(0, -3)}.md`,
          path: `${childRel}/index.md`,
          dir: childRel,
          type: 'note',
          ext: 'md'
        });
        continue;
      }
      const childAbs = path.join(absDir, entry.name);
      const children = depth >= MAX_DEPTH ? [] : await buildTree(childAbs, childRel, depth + 1);
      nodes.push({
        name: entry.name,
        path: childRel,
        type: 'folder',
        children
      });
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        path: childRel,
        type: 'file',
        ext: path.extname(entry.name).replace(/^\./, '').toLowerCase()
      });
    }
  }
  const rank = (node) => (node.type === 'note' ? 0 : node.type === 'folder' ? 1 : 2);
  nodes.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'es'));
  return nodes;
}

export function createApp(root) {
  const app = express();
  const wrap = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
  const json = express.json({ limit: '2mb' });

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.get('/api/tree', wrap(async (req, res) => {
    res.json({ root, tree: await buildTree(root) });
  }));

  app.get('/api/file', wrap(async (req, res) => {
    const rel = String(req.query.path ?? '');
    const abs = safeJoin(root, rel);
    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch {
      // Nota sin index.md (p. ej. carpeta *-md creada por fuera): la inicializamos
      const parts = rel.split('/');
      const parent = parts.length >= 2 ? parts[parts.length - 2] : '';
      const isNoteIndex = parent.endsWith('-md') && /^index\.md$/i.test(parts[parts.length - 1]);
      if (isNoteIndex) {
        try {
          const parentAbs = safeJoin(root, parts.slice(0, -1).join('/'));
          if ((await fsp.stat(parentAbs)).isDirectory()) {
            const title = parent.slice(0, -3).replace(/^-+|-+$/g, '') || parent;
            await fsp.writeFile(abs, `# ${title}\n\n`, 'utf8');
            stat = await fsp.stat(abs);
          }
        } catch {}
      }
      if (!stat) return res.status(404).json({ error: 'File not found' });
    }
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }
    const ext = path.extname(abs).toLowerCase();
    const { name, dir } = fileLabels(rel);
    if (TEXT_EXTS.has(ext)) {
      const content = await fsp.readFile(abs, 'utf8');
      return res.json({ name, dir, path: rel, type: 'file', ext: ext.slice(1), text: true, content });
    }
    return res.json({
      name,
      dir,
      path: rel,
      type: 'file',
      ext: ext.slice(1),
      text: false,
      mediaUrl: `/media/${toRelUrl(rel)}`
    });
  }));

  app.put('/api/file', json, wrap(async (req, res) => {
    const rel = String(req.body?.path ?? '');
    const abs = safeJoin(root, rel);
    // Sin mkdir: guardar solo funciona sobre archivos que siguen existiendo
    // (evita recrear la carpeta vieja si la nota fue renombrada o borrada).
    try {
      await fsp.writeFile(abs, String(req.body?.content ?? ''), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'The file no longer exists' });
      }
      throw error;
    }
    res.json({ ok: true });
  }));

  app.post('/api/file', json, wrap(async (req, res) => {
    const name = slug(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Invalid name' });
    const parentRel = String(req.body?.parent ?? '');
    const parentAbs = safeJoin(root, parentRel);
    const rel = parentRel ? `${parentRel}/${name}.md` : `${name}.md`;
    const abs = path.join(parentAbs, `${name}.md`);
    if (fs.existsSync(abs)) return res.status(409).json({ error: 'A file with that name already exists' });
    await fsp.writeFile(abs, String(req.body?.content ?? ''), 'utf8');
    res.status(201).json({ ok: true, path: rel });
  }));

  app.post('/api/note', json, wrap(async (req, res) => {
    const raw = String(req.body?.name ?? '').trim();
    let base = slug(raw);
    if (!base) return res.status(400).json({ error: 'Invalid name' });
    base = base.replace(/-md$/, '');
    if (!base) return res.status(400).json({ error: 'Invalid name' });
    const folder = `${base}-md`;
    const abs = path.join(root, folder);
    if (fs.existsSync(abs)) return res.status(409).json({ error: 'A note with that name already exists' });
    await fsp.mkdir(abs, { recursive: true });
    const title = raw.replace(/-md$/i, '').trim() || base;
    await fsp.writeFile(path.join(abs, 'index.md'), `# ${title}\n\n`, 'utf8');
    res.status(201).json({ ok: true, path: `${folder}/index.md` });
  }));

  app.post('/api/folder', json, wrap(async (req, res) => {
    const name = slug(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Invalid name' });
    const parentRel = String(req.body?.parent ?? '');
    const parentAbs = safeJoin(root, parentRel);
    const abs = path.join(parentAbs, name);
    if (fs.existsSync(abs)) return res.status(409).json({ error: 'A folder with that name already exists' });
    await fsp.mkdir(abs);
    // Una carpeta terminada en -md es una nota: le creamos su index.md
    if (name.endsWith('-md')) {
      const title = name.slice(0, -3).replace(/^-+|-+$/g, '') || name;
      await fsp.writeFile(path.join(abs, 'index.md'), `# ${title}\n\n`, 'utf8');
    }
    const rel = parentRel ? `${parentRel}/${name}` : name;
    res.status(201).json({ ok: true, path: rel });
  }));

  app.get('/api/resources', wrap(async (req, res) => {
    const dirRel = String(req.query.dir ?? '');
    const dirAbs = safeJoin(root, dirRel);
    const stat = await fsp.stat(dirAbs);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a folder' });
    const entries = await fsp.readdir(dirAbs, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.') || IGNORED.has(entry.name)) continue;
      if (entry.name === 'index.md') continue;
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      files.push({
        name: entry.name,
        path: rel,
        ext,
        type: IMAGE_EXTS.has(ext) ? 'image' : 'file',
        mediaUrl: `/media/${toRelUrl(rel)}`
      });
    }
    files.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    res.json({ files });
  }));

  app.post('/api/upload', express.raw({ type: '*/*', limit: '64mb' }), wrap(async (req, res) => {
    const dirRel = String(req.query.dir ?? '');
    const dirAbs = safeJoin(root, dirRel);
    const rawName = String(req.query.name ?? req.headers['x-filename'] ?? 'file');
    const name = path.basename(rawName).replace(/[^\p{L}\p{N}._ -]/gu, '_');
    if (!req.body?.length) return res.status(400).json({ error: 'No content' });
    await fsp.mkdir(dirAbs, { recursive: true });
    await fsp.writeFile(path.join(dirAbs, name), req.body);
    const rel = dirRel ? `${dirRel}/${name}` : name;
    res.status(201).json({ ok: true, path: rel, name });
  }));

  app.delete('/api/entry', wrap(async (req, res) => {
    const rel = String(req.query.path ?? '');
    if (!rel) return res.status(400).json({ error: 'Missing path' });
    const abs = safeJoin(root, rel);
    if (abs === root) return res.status(400).json({ error: 'Cannot delete the root folder' });
    await fsp.rm(abs, { recursive: true });
    res.json({ ok: true });
  }));

  app.patch('/api/entry', json, wrap(async (req, res) => {
    const rel = String(req.body?.path ?? '').split('\\').join('/');
    const rawName = String(req.body?.name ?? '');
    if (!rel) return res.status(400).json({ error: 'Missing path' });
    const abs = safeJoin(root, rel);
    const stat = await fsp.stat(abs).catch(() => null);
    if (!stat) return res.status(404).json({ error: 'Item not found' });
    const parentRel = path.posix.dirname(rel);
    const parentAbs = safeJoin(root, parentRel === '.' ? '' : parentRel);
    const currentName = path.basename(abs);

    let newName;
    if (stat.isDirectory()) {
      // notas (carpetas *-md): se admite que el usuario escriba el nombre con .md o -md
      let base = slug(rawName.replace(/\.md$/i, '').replace(/-md$/i, ''));
      if (!base) return res.status(400).json({ error: 'Invalid name' });
      if (currentName.endsWith('-md')) base = `${base}-md`;
      newName = base;
    } else {
      const ext = path.extname(rel);
      const base = slug(rawName.replace(/\.[^.]+$/, ''));
      if (!base) return res.status(400).json({ error: 'Invalid name' });
      newName = `${base}${ext}`;
    }

    if (newName === currentName) {
      return res.json({ ok: true, path: rel, unchanged: true });
    }
    const target = path.join(parentAbs, newName);
    if (fs.existsSync(target)) {
      return res.status(409).json({ error: 'An item with that name already exists' });
    }
    await fsp.rename(abs, target);
    const newRel = parentRel === '.' ? newName : `${parentRel}/${newName}`;
    res.json({ ok: true, path: newRel });
  }));

  app.post('/api/export', json, wrap(async (req, res) => {
    const rel = String(req.body?.path ?? '').split('\\').join('/');
    const format = String(req.body?.format ?? 'pdf');
    if (format !== 'pdf' && format !== 'docx') {
      return res.status(400).json({ error: 'Unsupported format' });
    }
    const abs = safeJoin(root, rel);
    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' });
    const source = await fsp.readFile(abs, 'utf8');
    const dirName = path.posix.dirname(rel);
    const baseRel = dirName === '.' ? '' : dirName;
    // El nombre del documento es el de la nota; para notas (index.md) se usa la carpeta sin -md.
    let title = path.basename(rel).replace(/\.(md|markdown)$/i, '');
    if (/^index$/i.test(title)) {
      const folder = path.basename(dirName).replace(/-md$/, '');
      if (folder && folder !== '.') title = folder;
    }
    const buffer = await exportMarkdown(source, { format, root, baseRel, title });
    res.setHeader(
      'content-type',
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(title)}.${format}`);
    res.send(buffer);
  }));

  app.use('/media', express.static(root, { fallthrough: false }));
  app.use(express.static(DIST_DIR));

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    const index = path.join(DIST_DIR, 'index.html');
    if (!fs.existsSync(index)) {
      return res.status(500).send('Frontend build missing. Run: pnpm build');
    }
    res.sendFile(index);
  });

  app.use((error, req, res, next) => {
    const status = error.status ?? (error.code === 'ENOENT' ? 404 : 500);
    res.status(status).json({ error: error.message ?? 'Error interno' });
  });

  return app;
}

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {}
}

export async function start(options = {}) {
  const root = path.resolve(options.dir ?? path.join(os.homedir(), 'freemd'));
  // Migración única: si existe la carpeta antigua ~/openmd y aún no hay ~/freemd,
  // la renombramos para que las notas no se "pierdan" tras el renombrado.
  let migrated = null;
  const legacyRoot = path.join(os.homedir(), 'openmd');
  if (!fs.existsSync(root) && fs.existsSync(legacyRoot)) {
    try {
      await fsp.rename(legacyRoot, root);
      migrated = legacyRoot;
    } catch {}
  }
  await fsp.mkdir(root, { recursive: true });
  const app = createApp(root);
  const port = options.port ?? (Number(process.env.FREEMD_PORT) || 5813);
  const host = options.host ?? process.env.FREEMD_HOST ?? 'localhost';
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
    instance.on('error', reject);
  });
  const display = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  const url = `http://${display}:${port}`;
  if (options.open) openBrowser(url);
  return { server, url, root, port, host, migrated };
}
