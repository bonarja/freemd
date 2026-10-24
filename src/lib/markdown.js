import MarkdownIt from 'markdown-it';
import markdownItHighlightjs from 'markdown-it-highlightjs';
import 'highlight.js/styles/atom-one-dark.css';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true }).use(markdownItHighlightjs);

function safeDecode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function toMediaUrl(base, src) {
  const baseParts = base.split('/').filter(Boolean).map(safeDecode);
  const parts = [];
  for (const part of src.split('/')) {
    if (!part || part === '.') continue;
    const decoded = safeDecode(part);
    if (decoded === '..') {
      parts.pop();
      continue;
    }
    parts.push(decoded);
  }
  return `/media/${[...baseParts, ...parts].map(encodeURIComponent).join('/')}`;
}

const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const src = token.attrGet('src') ?? '';
  if (env?.base !== undefined && src && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(src)) {
    token.attrSet('src', toMediaUrl(env.base, src));
  }
  return defaultImage(tokens, index, options, env, self);
};

export function render(source, base = '') {
  return md.render(source ?? '', { base });
}
