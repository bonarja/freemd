import hljs from 'highlight.js';

// Paleta atom-one-light: los exports son en tema claro.
const HLJS_COLORS = {
  'hljs-comment': 'A0A1A7',
  'hljs-quote': 'A0A1A7',
  'hljs-keyword': 'A626A4',
  'hljs-doctag': 'A626A4',
  'hljs-formula': 'A626A4',
  'hljs-section': 'E45649',
  'hljs-name': 'E45649',
  'hljs-selector-tag': 'E45649',
  'hljs-deletion': 'E45649',
  'hljs-subst': 'E45649',
  'hljs-literal': '0184BB',
  'hljs-string': '50A14F',
  'hljs-regexp': '50A14F',
  'hljs-addition': '50A14F',
  'hljs-attribute': '986801',
  'hljs-variable': '986801',
  'hljs-template-variable': '986801',
  'hljs-type': '986801',
  'hljs-selector-class': '986801',
  'hljs-selector-attr': '986801',
  'hljs-selector-pseudo': '986801',
  'hljs-number': '986801',
  'hljs-symbol': '4078F2',
  'hljs-bullet': '4078F2',
  'hljs-link': '4078F2',
  'hljs-meta': '4078F2',
  'hljs-selector-id': '4078F2',
  'hljs-title': '4078F2',
  'hljs-built_in': 'C18401'
};

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' '
};

function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
}

function colorForClassName(className) {
  for (const name of className.split(/\s+/)) {
    if (HLJS_COLORS[name]) return HLJS_COLORS[name];
  }
  return null;
}

// Convierte el HTML que produce hljs.highlight en segmentos planos
// { text, color }, resolviendo spans anidados con el color más interno.
function parseHljsHtml(html) {
  const segments = [];
  const stack = [];
  let text = '';
  const flush = () => {
    if (!text) return;
    let color = null;
    for (let i = stack.length - 1; i >= 0; i--) {
      color = colorForClassName(stack[i]);
      if (color) break;
    }
    segments.push({ text, color });
    text = '';
  };
  const tags = /<span class="([^"]*)">|<\/span>/g;
  let cursor = 0;
  let match;
  while ((match = tags.exec(html))) {
    if (match.index > cursor) text += decodeEntities(html.slice(cursor, match.index));
    if (match[1] !== undefined) {
      flush();
      stack.push(match[1]);
    } else {
      flush();
      stack.pop();
    }
    cursor = tags.lastIndex;
  }
  if (cursor < html.length) text += decodeEntities(html.slice(cursor));
  flush();
  return segments;
}

function mergeSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.color === segment.color) last.text += segment.text;
    else merged.push({ ...segment });
  }
  return merged;
}

// Devuelve segmentos coloreados del código; sin lenguaje reconocido, texto plano.
export function highlightSegments(code, info) {
  const language = String(info ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!language || !hljs.getLanguage(language)) {
    return [{ text: code, color: null }];
  }
  try {
    return mergeSegments(parseHljsHtml(hljs.highlight(code, { language, ignoreIllegals: true }).value));
  } catch {
    return [{ text: code, color: null }];
  }
}

// Parte segmentos en líneas conservando el color de cada tramo.
export function splitSegmentsByLines(segments) {
  const lines = [[]];
  for (const segment of segments) {
    const parts = segment.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, color: segment.color });
    });
  }
  return lines;
}
