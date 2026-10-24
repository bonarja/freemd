<script>
  import Sidebar from './lib/Sidebar.svelte';
  import Editor from './lib/Editor.svelte';
  import * as api from './lib/api.js';

  let tree = $state(null);
  let root = $state('~/openmd');
  let current = $state(null);
  let content = $state('');
  let saved = $state('');
  let mode = $state('edit');

  let toast = $state(null);
  let toastTimer;

  const dirty = $derived(Boolean(current?.text) && content !== saved);

  const uploadDir = $derived.by(() => {
    if (!current) return null;
    const parts = current.path.split('/');
    parts.pop();
    const base = parts[parts.length - 1] ?? '';
    return base.endsWith('-md') ? parts.join('/') : null;
  });

  function notify(message, kind = 'ok') {
    toast = { message, kind };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 2600);
  }

  async function refresh() {
    try {
      const data = await api.getTree();
      tree = data.tree;
      root = data.root;
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function openNode(node, options = {}) {
    const target = node.path;
    if (
      !options.force &&
      current &&
      target !== current.path &&
      dirty &&
      !confirm('Hay cambios sin guardar. ¿Continuar sin guardar?')
    ) {
      return;
    }
    try {
      const file = await api.readFile(target);
      current = file;
      content = file.text ? file.content : '';
      saved = content;
      mode = 'edit';
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function save() {
    if (!current?.text) return;
    try {
      await api.saveFile(current.path, content);
      saved = content;
      notify('Guardado');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function handleCreate(kind, name) {
    try {
      if (kind === 'note') {
        const result = await api.createNote(name);
        await refresh();
        await openNode({ path: result.path, type: 'file' }, { force: true });
        notify('Nota creada');
      } else {
        await api.createFolder('', name);
        await refresh();
        notify('Carpeta creada');
      }
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function handleUpload(file) {
    if (uploadDir === null) return;
    try {
      await api.uploadFile(uploadDir, file);
      await refresh();
      notify(`Recurso añadido: ${file.name}`);
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function handleDelete(node) {
    if (!confirm(`¿Eliminar "${node.name}"?`)) return;
    try {
      const target = node.dir ?? node.path;
      await api.removeEntry(target);
      if (current && (current.path === target || current.path.startsWith(`${target}/`))) {
        current = null;
        content = '';
        saved = '';
      }
      await refresh();
      notify('Eliminado');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  function handleKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  }

  function handleBeforeUnload(event) {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  refresh();
</script>

<svelte:window onkeydown={handleKeydown} onbeforeunload={handleBeforeUnload} />

<div class="app">
  <Sidebar
    {tree}
    {current}
    {root}
    {uploadDir}
    onopen={openNode}
    oncreate={handleCreate}
    onupload={handleUpload}
    ondelete={handleDelete}
  />
  <main class="main">
    {#if current}
      <Editor file={current} bind:content bind:mode {dirty} onsave={save} />
    {:else}
      <div class="empty">
        <p class="logo">open<span style="color: var(--green)">md</span></p>
        <p>
          {tree && tree.length === 0
            ? 'Crea tu primera nota con el botón de arriba a la izquierda.'
            : 'Selecciona una nota en el panel lateral.'}
        </p>
      </div>
    {/if}
  </main>
  {#if toast}
    <div class="toast {toast.kind}">{toast.message}</div>
  {/if}
</div>
