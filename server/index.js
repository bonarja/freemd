import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
    const error = new Error('Ruta no permitida');
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
    const stat = await fsp.stat(abs);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'No es un archivo' });
    }
    const ext = path.extname(abs).toLowerCase();
    const name = path.basename(abs);
    if (TEXT_EXTS.has(ext)) {
      const content = await fsp.readFile(abs, 'utf8');
      return res.json({ name, path: rel, type: 'file', ext: ext.slice(1), text: true, content });
    }
    return res.json({
      name,
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
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, String(req.body?.content ?? ''), 'utf8');
    res.json({ ok: true });
  }));

  app.post('/api/file', json, wrap(async (req, res) => {
    const name = slug(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Nombre inválido' });
    const parentRel = String(req.body?.parent ?? '');
    const parentAbs = safeJoin(root, parentRel);
    const rel = parentRel ? `${parentRel}/${name}.md` : `${name}.md`;
    const abs = path.join(parentAbs, `${name}.md`);
    if (fs.existsSync(abs)) return res.status(409).json({ error: 'Ya existe un archivo con ese nombre' });
    await fsp.writeFile(abs, String(req.body?.content ?? ''), 'utf8');
    res.status(201).json({ ok: true, path: rel });
  }));

  app.post('/api/note', json, wrap(async (req, res) => {
    const raw = String(req.body?.name ?? '').trim();
    let base = slug(raw);
    if (!base) return res.status(400).json({ error: 'Nombre inválido' });
    base = base.replace(/-md$/, '');
    if (!base) return res.status(400).json({ error: 'Nombre inválido' });
    const folder = `${base}-md`;
    const abs = path.join(root, folder);
    if (fs.existsSync(abs)) return res.status(409).json({ error: 'Ya existe una nota con ese nombre' });
    await fsp.mkdir(abs, { recursive: true });
    const title = raw.replace(/-md$/i, '').trim() || base;
    await fsp.writeFile(path.join(abs, 'index.md'), `# ${title}\n\n`, 'utf8');
    res.status(201).json({ ok: true, path: `${folder}/index.md` });
  }));

  app.post('/api/folder', json, wrap(async (req, res) => {
    const name = slug(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Nombre inválido' });
    const parentRel = String(req.body?.parent ?? '');
    const parentAbs = safeJoin(root, parentRel);
    const abs = path.join(parentAbs, name);
    if (fs.existsSync(abs)) return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
    await fsp.mkdir(abs);
    const rel = parentRel ? `${parentRel}/${name}` : name;
    res.status(201).json({ ok: true, path: rel });
  }));

  app.get('/api/resources', wrap(async (req, res) => {
    const dirRel = String(req.query.dir ?? '');
    const dirAbs = safeJoin(root, dirRel);
    const stat = await fsp.stat(dirAbs);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'No es una carpeta' });
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
    if (!req.body?.length) return res.status(400).json({ error: 'Sin contenido' });
    await fsp.mkdir(dirAbs, { recursive: true });
    await fsp.writeFile(path.join(dirAbs, name), req.body);
    const rel = dirRel ? `${dirRel}/${name}` : name;
    res.status(201).json({ ok: true, path: rel });
  }));

  app.delete('/api/entry', wrap(async (req, res) => {
    const rel = String(req.query.path ?? '');
    if (!rel) return res.status(400).json({ error: 'Falta la ruta' });
    const abs = safeJoin(root, rel);
    if (abs === root) return res.status(400).json({ error: 'No se puede borrar la carpeta raíz' });
    await fsp.rm(abs, { recursive: true });
    res.json({ ok: true });
  }));

  app.use('/media', express.static(root, { fallthrough: false }));
  app.use(express.static(DIST_DIR));

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    const index = path.join(DIST_DIR, 'index.html');
    if (!fs.existsSync(index)) {
      return res.status(500).send('Falta la build del frontend. Ejecuta: pnpm build');
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
  const root = path.resolve(options.dir ?? path.join(os.homedir(), 'openmd'));
  await fsp.mkdir(root, { recursive: true });
  const app = createApp(root);
  const port = options.port ?? (Number(process.env.OPENMD_PORT) || 5813);
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, 'localhost', () => resolve(instance));
    instance.on('error', reject);
  });
  const url = `http://localhost:${port}`;
  if (options.open) openBrowser(url);
  return { server, url, root, port };
}
