async function request(url, options = {}) {
  const response = await fetch(url, options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(data?.error ?? `Error ${response.status}`);
  }
  return data;
}

const json = (body) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

export const getTree = () => request('/api/tree');

export const readFile = (path) => request(`/api/file?path=${encodeURIComponent(path)}`);

export const saveFile = (path, content) =>
  request('/api/file', { method: 'PUT', ...json({ path, content }) });

export const createNote = (name, parent = '') =>
  request('/api/note', { method: 'POST', ...json({ name, parent }) });

export const createFolder = (parent, name) =>
  request('/api/folder', { method: 'POST', ...json({ parent, name }) });

export const removeEntry = (path) =>
  request(`/api/entry?path=${encodeURIComponent(path)}`, { method: 'DELETE' });

export const renameEntry = (path, name) =>
  request('/api/entry', { method: 'PATCH', ...json({ path, name }) });

export const moveEntry = (from, to) =>
  request('/api/move', { method: 'POST', ...json({ from, to }) });

export const getResources = (dir) =>
  request(`/api/resources?dir=${encodeURIComponent(dir)}`);

export async function exportFile(path, format) {
  const response = await fetch('/api/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, format })
  });
  if (!response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    throw new Error(data?.error ?? `Error ${response.status}`);
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename\*=UTF-8''([^;\s]+)/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : null;
  return { blob: await response.blob(), filename };
}

export async function uploadFile(dir, file) {
  const params = new URLSearchParams({ dir, name: file.name });
  const response = await fetch(`/api/upload?${params}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: file
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) throw new Error(data?.error ?? `Error ${response.status}`);
  return data;
}
