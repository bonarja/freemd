<script>
  import { fly } from 'svelte/transition';
  import TreeItem from './TreeItem.svelte';
  import Icon from './Icon.svelte';

  let {
    tree,
    current,
    root,
    uploadDir,
    createRequest = 0,
    isMobile = false,
    renameTarget = null,
    onopen,
    oncreate,
    onpick,
    ondelete,
    onrename,
    onactions,
    onrenamehandled,
    oncreatenotein,
    onmove
  } = $props();

  // La raíz del árbol también acepta drops (saca notas de las carpetas).
  function rootDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function rootDrop(event) {
    event.preventDefault();
    const dragged = event.dataTransfer.getData('text/freemd-path');
    if (!dragged || !dragged.includes('/')) return;
    onmove?.(dragged, '');
  }

  let creating = $state(null);
  let name = $state('');
  let handledRequest = 0;

  // La pantalla vacía puede pedir abrir el formulario de nueva nota.
  $effect(() => {
    if (createRequest > handledRequest) {
      handledRequest = createRequest;
      startCreating('note');
    }
  });

  function startCreating(type) {
    creating = { type };
    name = '';
  }

  function cancelCreating() {
    creating = null;
    name = '';
  }

  async function submitCreating(event) {
    event.preventDefault();
    const type = creating?.type;
    const value = name.trim();
    cancelCreating();
    if (!value || !type) return;
    await oncreate?.(type, value);
  }

  function autofocus(node) {
    requestAnimationFrame(() => node.focus());
  }

  // ---- Ordenación de la lista ----
  // Se recuerda entre sesiones (misma convención que editor/sidebar). Default:
  // por creación, las más nuevas primero. Clave v2: la v1 quedó contaminada con
  // el default anterior (name/asc) que se escribía al montar el componente.
  const SORT_KEY = 'freemd:sort:v2';
  const SORT_DIRECTION = { asc: 1, desc: -1 };

  function readSortPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(SORT_KEY) ?? '');
      return {
        field:
          raw?.field === 'updated' || raw?.field === 'created' || raw?.field === 'name'
            ? raw.field
            : 'created',
        order: raw?.order === 'asc' || raw?.order === 'desc' ? raw.order : 'desc'
      };
    } catch {
      return { field: 'created', order: 'desc' };
    }
  }

  let sortBy = $state(readSortPrefs());
  let sortMenu = $state(false);

  $effect(() => {
    localStorage.setItem(SORT_KEY, JSON.stringify(sortBy));
  });

  // La vista agrupa carpetas arriba, luego notas y archivos; el criterio
  // elegido ordena dentro de cada grupo (desempate por nombre) y también se
  // aplica al contenido de las carpetas, recursivamente.
  function sortTree(nodes) {
    const dir = SORT_DIRECTION[sortBy.order];
    const { field } = sortBy;
    const rank = (node) => (node.type === 'folder' ? 0 : node.type === 'note' ? 1 : 2);
    const byName = (a, b) => a.name.localeCompare(b.name, 'es');
    return nodes
      .map((node) =>
        node.type === 'folder' && node.children
          ? { ...node, children: sortTree(node.children) }
          : node
      )
      .sort((a, b) => {
        const byRank = rank(a) - rank(b);
        if (byRank) return byRank;
        if (field === 'name') return byName(a, b) * dir;
        const av = field === 'created' ? a.ctime ?? 0 : a.mtime ?? 0;
        const bv = field === 'created' ? b.ctime ?? 0 : b.mtime ?? 0;
        return (av - bv) * dir || byName(a, b);
      });
  }

  const sortedTree = $derived(tree ? sortTree(tree) : tree);

  // Cierra el menú al tocar fuera: el botón y el propio menú llevan .sort-menu-root.
  function handlePointerDown(event) {
    if (!sortMenu || event.target?.closest?.('.sort-menu-root')) return;
    sortMenu = false;
  }
</script>

<svelte:window onpointerdown={handlePointerDown} onkeydown={(e) => e.key === 'Escape' && sortMenu && (sortMenu = false)} />

<aside class="sidebar">
  <div class="side-head">
    <span class="brand">free<span class="brand-md">md</span></span>
    <div class="head-actions">
      <button
        class="sort-btn sort-menu-root"
        class:open={sortMenu}
        title="Sort by"
        aria-expanded={sortMenu}
        onclick={() => (sortMenu = !sortMenu)}
      >
        Sort by
        <Icon name="chevron-down" size={11} />
      </button>
      <button class="icon-btn" title="New note" onclick={() => startCreating('note')}>
        <Icon name="plus" size={16} />
      </button>
      <button class="icon-btn" title="New folder" onclick={() => startCreating('folder')}>
        <Icon name="folder" size={16} />
      </button>
      <button
        class="icon-btn"
        title="Add resource to current note"
        onclick={() => onpick?.()}
        disabled={uploadDir === null}
      >
        <Icon name="upload" size={16} />
      </button>

      {#if sortMenu}
        <div class="sort-pop sort-menu-root" transition:fly={{ y: -4, duration: 140 }}>
          <button
            class="sort-opt"
            class:selected={sortBy.field === 'updated'}
            onclick={() => (sortBy.field = 'updated')}
          >
            <span class="sort-check"><Icon name="check" size={12} /></span>
            <span class="sort-arrow"></span>
            Updated
          </button>
          <button
            class="sort-opt"
            class:selected={sortBy.field === 'created'}
            onclick={() => (sortBy.field = 'created')}
          >
            <span class="sort-check"><Icon name="check" size={12} /></span>
            <span class="sort-arrow"></span>
            Created
          </button>
          <button
            class="sort-opt"
            class:selected={sortBy.field === 'name'}
            onclick={() => (sortBy.field = 'name')}
          >
            <span class="sort-check"><Icon name="check" size={12} /></span>
            <span class="sort-arrow"></span>
            Name
          </button>
          <div class="sort-sep"></div>
          <p class="sort-label">Sort order</p>
          <button
            class="sort-opt"
            class:selected={sortBy.order === 'desc'}
            onclick={() => (sortBy.order = 'desc')}
          >
            <span class="sort-check"><Icon name="check" size={12} /></span>
            <span class="sort-arrow"><Icon name="arrow-down" size={12} /></span>
            Descending
          </button>
          <button
            class="sort-opt"
            class:selected={sortBy.order === 'asc'}
            onclick={() => (sortBy.order = 'asc')}
          >
            <span class="sort-check"><Icon name="check" size={12} /></span>
            <span class="sort-arrow"><Icon name="arrow-up" size={12} /></span>
            Ascending
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if creating}
    <form class="new-item" onsubmit={submitCreating}>
      <input
        use:autofocus
        bind:value={name}
        placeholder={creating.type === 'note' ? 'note name' : 'folder name'}
        onkeydown={(event) => event.key === 'Escape' && cancelCreating()}
        onblur={cancelCreating}
      />
    </form>
  {/if}

  <nav
    class="tree"
    ondragover={rootDragOver}
    ondrop={rootDrop}
  >
    {#if tree === null}
      <p class="tree-loading">Loading…</p>
    {:else if tree.length === 0}
      <p class="tree-empty">No notes yet.<br />Create your first one with the buttons above.</p>
    {:else}
      {#each sortedTree as node (node.path)}
        <TreeItem
          {node}
          {current}
          depth={0}
          {isMobile}
          {renameTarget}
          {onopen}
          {ondelete}
          {onrename}
          {onactions}
          {onrenamehandled}
          {oncreatenotein}
          {onmove}
        />
      {/each}
    {/if}
  </nav>

  <div class="side-foot">
    <button class="upload-btn" onclick={() => onpick?.()} disabled={uploadDir === null}>
      <Icon name="upload" size={14} />
      Add resource
    </button>
    <span class="root-hint" title="Notes folder">{root}</span>
  </div>
</aside>
