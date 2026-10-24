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

  let resources = $state([]);
  let panelOpen = $state(false);
  let savedFlash = $state(false);

  let toast = $state(null);
  let toastTimer;
  let autosaveTimer;
  let flashTimer;
  let fileInput = $state(null);

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

  async function loadResources() {
    if (uploadDir === null) {
      resources = [];
      return;
    }
    try {
      resources = (await api.getResources(uploadDir)).files;
    } catch {
      resources = [];
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
      await loadResources();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function save(auto = false) {
    if (!current?.text) return;
    try {
      await api.saveFile(current.path, content);
      saved = content;
      if (auto) {
        savedFlash = true;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => (savedFlash = false), 1600);
      } else {
        notify('Guardado');
      }
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  $effect(() => {
    const value = content;
    if (!current?.text || value === saved) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => save(true), 1200);
    return () => clearTimeout(autosaveTimer);
  });

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
      await loadResources();
      panelOpen = true;
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
        resources = [];
      }
      await refresh();
      notify('Eliminado');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  function pickUpload() {
    fileInput?.click();
  }

  async function handleFileChange(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) await handleUpload(file);
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
    onpick={pickUpload}
    ondelete={handleDelete}
  />
  <main class="main">
    {#if current}
      <Editor
        file={current}
        bind:content
        bind:mode
        {dirty}
        {savedFlash}
        {resources}
        resourcesEnabled={uploadDir !== null}
        bind:panelOpen
        onsave={() => save()}
        onpick={pickUpload}
      />
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
  <input type="file" hidden bind:this={fileInput} onchange={handleFileChange} />
</div>
