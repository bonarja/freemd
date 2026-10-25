<script>
  import Sidebar from './lib/Sidebar.svelte';
  import Editor from './lib/Editor.svelte';
  import Icon from './lib/Icon.svelte';
  import ActionSheet from './lib/ActionSheet.svelte';
  import * as api from './lib/api.js';

  let tree = $state(null);
  let root = $state('~/freemd');
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
  let createRequest = $state(0);
  let nodeSheet = $state(null);
  let renameTarget = $state(null);

  const nodeSheetActions = $derived.by(() => {
    if (!nodeSheet) return [];
    // Snapshot: onclose() pone nodeSheet en null ANTES de ejecutar la acción.
    const node = nodeSheet;
    const images = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];
    const icon =
      node.type === 'note' ? 'note' : images.includes(node.ext) ? 'image' : 'file';
    return [
      { label: 'Open', icon, onclick: () => openNode(node) },
      { label: 'Rename', icon: 'pencil', onclick: () => (renameTarget = node) },
      { label: 'Delete', icon: 'trash', danger: true, onclick: () => handleDelete(node) }
    ];
  });

  const mobileQuery =
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)') : null;
  let isMobile = $state(mobileQuery?.matches ?? false);

  $effect(() => {
    if (!mobileQuery) return;
    const update = () => (isMobile = mobileQuery.matches);
    update();
    mobileQuery.addEventListener('change', update);
    return () => mobileQuery.removeEventListener('change', update);
  });

  // En móvil el drawer arranca cerrado y no se persiste; en desktop se respeta
  // lo guardado (clave v2: la v1 quedó contaminada con estados de móvil).
  let sidebarOpen = $state(
    !mobileQuery?.matches && localStorage.getItem('freemd:sidebar:v2') !== '0'
  );

  $effect(() => {
    if (isMobile) return;
    localStorage.setItem('freemd:sidebar:v2', sidebarOpen ? '1' : '0');
  });

  // Sin nota seleccionada en desktop el sidebar siempre está abierto,
  // sin importar el valor persistido del toggle.
  const sidebarVisible = $derived(current === null && !isMobile ? true : sidebarOpen);

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function requestNewNote() {
    if (!sidebarVisible) sidebarOpen = true; // el formulario vive en el sidebar
    createRequest++;
  }

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
      !confirm('There are unsaved changes. Continue without saving?')
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
      if (isMobile) sidebarOpen = false; // seleccionar nota cierra el drawer
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
        notify('Saved');
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
        notify('Note created');
      } else {
        await api.createFolder('', name);
        await refresh();
        notify('Folder created');
      }
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function uploadResource(file) {
    if (uploadDir === null) return null;
    try {
      const result = await api.uploadFile(uploadDir, file);
      await refresh();
      await loadResources();
      panelOpen = true;
      return result;
    } catch (error) {
      notify(error.message, 'error');
      return null;
    }
  }

  async function handleUpload(file) {
    const result = await uploadResource(file);
    if (result) notify(`Resource added: ${file.name}`);
  }

  // El pegado necesita el recurso con forma { name, path, type } para insertarlo.
  async function handlePasteImage(file) {
    const result = await uploadResource(file);
    if (!result) return null;
    const name = result.name ?? result.path.split('/').pop();
    notify(`Image pasted: ${name}`);
    return { name, path: result.path, type: 'image' };
  }

  async function handleRemoveResource(resource) {
    if (!confirm(`Delete "${resource.name}"?`)) return;
    try {
      await api.removeEntry(resource.path);
      await loadResources();
      notify('Resource deleted');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function handleExport(format) {
    if (!current?.text) return;
    try {
      if (dirty) await save(true);
      const { blob, filename } = await api.exportFile(current.path, format);
      // Nombre visible: la nota (mi-nota.md), no index.md
      const parts = current.path.split('/');
      let base = current.name.replace(/\.[^.]+$/, '');
      if (/^index$/i.test(base) && parts.length >= 2) {
        base = parts[parts.length - 2].replace(/-md$/, '') || base;
      }
      const name = filename ?? `${base}.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
      notify(`Exported: ${name}`);
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function handleDelete(node) {
    if (!confirm(`Delete "${node.name}"?`)) return;
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
      notify('Deleted');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  // Recalcula nombre/crumb visibles tras un renombrado, conservando el buffer.
  function relabel(path) {
    const parts = path.split('/');
    const last = parts[parts.length - 1];
    const parent = parts.length >= 2 ? parts[parts.length - 2] : '';
    if (/^index\.md$/i.test(last) && parent.endsWith('-md')) {
      return {
        ...current,
        path,
        name: `${parent.slice(0, -3)}.md`,
        dir: parts.length >= 3 ? `${parts.slice(0, -2).join('/')}/` : ''
      };
    }
    return {
      ...current,
      path,
      name: last,
      dir: parts.length >= 2 ? `${parts.slice(0, -1).join('/')}/` : ''
    };
  }

  async function handleRename(node, name) {
    const target = node.dir ?? node.path;
    try {
      clearTimeout(autosaveTimer); // evita guardar en la ruta vieja a mitad del rename
      const result = await api.renameEntry(target, name);
      if (
        current &&
        result.path !== target &&
        (current.path === target || current.path.startsWith(`${target}/`))
      ) {
        current = relabel(`${result.path}${current.path.slice(target.length)}`);
      }
      await refresh();
      notify('Renamed');
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
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      toggleSidebar();
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
  {#if sidebarVisible && isMobile}
    <button
      class="drawer-backdrop"
      aria-label="Close sidebar"
      tabindex="-1"
      onclick={toggleSidebar}
    ></button>
  {/if}
  <div class="sidebar-slot" class:collapsed={!sidebarVisible}>
    <Sidebar
      {tree}
      {current}
      {root}
      {uploadDir}
      {createRequest}
      {isMobile}
      {renameTarget}
      onopen={openNode}
      oncreate={handleCreate}
      onpick={pickUpload}
      ondelete={handleDelete}
      onrename={handleRename}
      onactions={(node) => (nodeSheet = node)}
      onrenamehandled={() => (renameTarget = null)}
    />
  </div>
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
        {sidebarVisible}
        onsidebar={toggleSidebar}
        {isMobile}
        onsave={() => save()}
        onpick={pickUpload}
        onexport={handleExport}
        onremove={handleRemoveResource}
        onpasteimage={handlePasteImage}
      />
    {:else}
      <div class="empty">
        {#if !sidebarVisible && isMobile}
          <button class="icon-btn sidebar-open" title="Show notes" onclick={toggleSidebar}>
            <Icon name="panel" size={16} />
          </button>
        {/if}
        <p class="logo">free<span style="color: var(--green)">md</span></p>
        <p>
          {tree && tree.length === 0 ? 'No notes yet.' : 'Select a note in the sidebar.'}
        </p>
        <button class="primary-btn" onclick={requestNewNote}>
          <Icon name="note" size={15} />
          New note
        </button>
      </div>
    {/if}
  </main>
  {#if toast}
    <div class="toast {toast.kind}">{toast.message}</div>
  {/if}
  {#if nodeSheet}
    <ActionSheet
      title={nodeSheet.name}
      actions={nodeSheetActions}
      onclose={() => (nodeSheet = null)}
    />
  {/if}
  <input type="file" hidden bind:this={fileInput} onchange={handleFileChange} />
</div>
