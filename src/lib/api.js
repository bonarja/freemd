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

export const createNote = (name) => request('/api/note', { method: 'POST', ...json({ name }) });

export const createFolder = (parent, name) =>
  request('/api/folder', { method: 'POST', ...json({ parent, name }) });

export const removeEntry = (path) =>
  request(`/api/entry?path=${encodeURIComponent(path)}`, { method: 'DELETE' });

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
  return response.blob();
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
