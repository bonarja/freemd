import fsp from 'node:fs/promises';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { imageSize } from 'image-size';
import { markdownToDocx } from './to-docx.js';
import { markdownToPdf } from './to-pdf.js';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

function collectImageTokens(tokens, acc = []) {
  for (const token of tokens) {
    if (token.type === 'image') acc.push(token);
    if (Array.isArray(token.children)) collectImageTokens(token.children, acc);
  }
  return acc;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readLocalImage(root, baseRel, src) {
  const cleaned = safeDecode(src).replace(/^\.\//, '');
  const candidates = [];
  if (cleaned.startsWith('/')) {
    candidates.push(cleaned.slice(1));
  } else {
    if (baseRel) candidates.push(path.posix.join(baseRel, cleaned));
    candidates.push(cleaned);
  }
  for (const candidate of candidates) {
    const abs = path.resolve(root, candidate);
    if (abs !== root && !abs.startsWith(root + path.sep)) continue;
    try {
      return await fsp.readFile(abs);
    } catch {}
  }
  return null;
}

async function loadImage(root, baseRel, src) {
  try {
    let buffer;
    if (/^data:image\//i.test(src)) {
      buffer = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
    } else if (/^https?:\/\//i.test(src)) {
      const response = await fetch(src, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return null;
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      buffer = await readLocalImage(root, baseRel, src);
    }
    if (!buffer?.length) return null;
    const dims = imageSize(buffer);
    if (!dims?.width || !dims?.height) return null;
    return {
      buffer,
      type: dims.type === 'jpeg' ? 'jpg' : dims.type,
      width: dims.width,
      height: dims.height
    };
  } catch {
    return null;
  }
}

export async function exportMarkdown(markdown, options) {
  const tokens = md.parse(markdown, {});
  const images = new Map();
  await Promise.all(
    collectImageTokens(tokens).map(async (token) => {
      const src = token.attrGet('src') ?? '';
      if (!images.has(src)) {
        images.set(src, await loadImage(options.root, options.baseRel, src));
      }
    })
  );
  const ctx = { images, title: options.title };
  if (options.format === 'docx') return markdownToDocx(tokens, ctx);
  return markdownToPdf(tokens, ctx);
}
