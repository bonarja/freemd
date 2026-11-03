// Router mínimo con runes: rutas de notas bajo /note/ sin dependencias.
// La URL sigue los nombres visibles en el árbol (fileLabels): una nota
// folder/mi-nota-md/index.md vive en /note/folder/mi-nota.md. Los recursos
// (imágenes, adjuntos) NO pasan por aquí: siguen sirviéndose desde /media/…
function parseUrl(href) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(href, 'http://x').pathname);
  } catch {
    return { name: 'notfound', segments: [] };
  }
  const raw = pathname.split('/').filter(Boolean);
  if (raw.length === 0) return { name: 'home', segments: [] };
  if (raw[0] !== 'note') return { name: 'unknown', segments: [] };
  const segments = raw.slice(1);
  if (segments.length === 0) return { name: 'home', segments: [] };
  return { name: 'note', segments };
}

// Estado exportado: no se puede reasignar un $state exportado, pero mutar
// una propiedad sí, así route vive como propiedad del objeto router.
// Solo cliente (no hay SSR): window existe siempre aquí.
export const router = $state({ route: parseUrl(window.location.href) });

window.addEventListener('popstate', () => {
  router.route = parseUrl(window.location.href);
});

export function navigate(path, { replace = false } = {}) {
  const url = new URL(path, window.location.origin);
  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
  router.route = parseUrl(window.location.href);
}

// path (relPath del API) → URL visible: /note/folder/mi-nota.md
export function pathToUrl(relPath) {
  const parts = relPath.split('/');
  const last = parts[parts.length - 1];
  const parent = parts.length >= 2 ? parts[parts.length - 2] : '';
  let segments = parts;
  // Las notas viven en <nombre>-md/index.md pero se expone <nombre>.md
  if (/^index\.md$/i.test(last) && parent.endsWith('-md')) {
    segments = [...parts.slice(0, -2), `${parent.slice(0, -3)}.md`];
  }
  return `/note/${segments.map(encodeURIComponent).join('/')}`;
}

// URL visible → rutas reales candidatas (probamos en orden, primera que exista).
// Nota preferida sobre archivo suelto cuando el nombre coincide
// (carpeta x-md/index.md delante de archivo x.md).
export function urlToCandidates(relUrl) {
  const parts = relUrl.split('/').filter(Boolean);
  if (parts.length === 0) return [];
  const head = parts.slice(0, -1);
  const last = parts[parts.length - 1];
  const out = [];
  if (/\.md$/i.test(last)) {
    const base = last.replace(/\.md$/i, '');
    out.push([...head, `${base}-md`, 'index.md'].join('/'));
    out.push([...head, last].join('/'));
  } else {
    out.push([...head, last].join('/'));
  }
  return out;
}
