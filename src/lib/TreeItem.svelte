<script>
  import TreeItem from './TreeItem.svelte';
  import Icon from './Icon.svelte';

  let {
    node,
    current,
    depth = 0,
    isMobile = false,
    renameTarget = null,
    onopen,
    ondelete,
    onrename,
    onactions,
    onrenamehandled,
    oncreatenotein,
    onmove
  } = $props();

  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);

  let toggled = $state(null);
  let renaming = $state(false);
  let draftName = $state('');
  let creatingIn = $state(false);
  let newName = $state('');
  let dropActive = $state(false);

  const expanded = $derived(toggled ?? depth === 0);
  const isContainer = $derived(node.type === 'folder');
  const isImage = $derived(IMAGE_EXTS.has(node.ext));
  const iconName = $derived(
    node.type === 'note' ? 'note' : node.type === 'folder' ? 'folder' : isImage ? 'image' : 'file'
  );
  const iconClass = $derived(
    node.type === 'note'
      ? 't-note'
      : node.type === 'folder'
        ? 't-folder'
        : isImage
          ? 't-image'
          : node.ext === 'md'
            ? 't-md'
            : 't-file'
  );
  const active = $derived(
    Boolean(current) &&
      (current.path === node.path || (isContainer && current.path.startsWith(`${node.path}/`)))
  );
  // Nombre editable sin sufijos: notas sin -md, archivos sin extensión
  const nameBase = $derived(
    node.type === 'note'
      ? node.name.replace(/\.md$/i, '')
      : node.type === 'folder'
        ? node.name
        : node.name.replace(/\.[^.]+$/, '')
  );

  // En móvil tocar una nota/archivo abre el action sheet (abrir/renombrar/eliminar);
  // las carpetas siguen expandiéndose con el tap directo.
  function handleClick() {
    if (isMobile && !isContainer) {
      onactions?.(node);
      return;
    }
    if (!isContainer) {
      onopen?.(node);
      return;
    }
    toggled = !expanded;
  }

  // El action sheet pide renombrar esta entrada: abre el input en línea.
  $effect(() => {
    if (renameTarget && renameTarget.path === node.path) {
      startRenaming();
      onrenamehandled?.();
    }
  });

  function startRenaming() {
    draftName = nameBase;
    renaming = true;
  }

  async function submitRename(event) {
    event.preventDefault();
    const value = draftName.trim();
    renaming = false;
    if (value && value !== nameBase) await onrename?.(node, value);
  }

  function startCreateIn() {
    toggled = true;
    newName = '';
    creatingIn = true;
  }

  async function submitCreateIn(event) {
    event.preventDefault();
    const value = newName.trim();
    creatingIn = false;
    if (value) await oncreatenotein?.(node, value);
  }

  function autofocus(input) {
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  // Drag & drop: arrastrar notas/archivos/carpetas hacia carpetas o a la raíz.
  // Para notas se arrastra la CARPETA completa (node.dir), nunca el index.md.
  function dragStart(event) {
    event.dataTransfer.setData('text/freemd-path', node.dir ?? node.path);
    event.dataTransfer.effectAllowed = 'move';
  }

  function dragOver(event) {
    if (!isContainer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dropActive = true;
  }

  function dragLeave() {
    dropActive = false;
  }

  function drop(event) {
    dropActive = false;
    if (!isContainer) return;
    event.preventDefault();
    const dragged = event.dataTransfer.getData('text/freemd-path');
    if (!dragged || dragged === node.path || dragged.startsWith(`${node.path}/`)) return;
    onmove?.(dragged, node.path);
  }
</script>

<div class="item" class:active>
  <button
    class="row"
    class:drag-over={dropActive}
    style:padding-left={`${depth * 14 + 8}px`}
    draggable={!isMobile}
    ondragstart={dragStart}
    ondragover={dragOver}
    ondragleave={dragLeave}
    ondrop={drop}
    onclick={handleClick}
    title={node.name}
  >
    {#if isContainer}
      <span class="chev" class:open={expanded}>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    {:else}
      <span class="chev"></span>
    {/if}
    <span class="icon {iconClass}"><Icon name={iconName} size={15} /></span>
    <span class="label">{node.name}</span>
  </button>
  {#if isContainer}
    <button class="del add-note" title="New note inside" onclick={startCreateIn}>
      <Icon name="note-plus" size={13} />
    </button>
  {/if}
  <button class="del" title="Rename" onclick={startRenaming}>
    <Icon name="pencil" size={13} />
  </button>
  <button class="del" title="Delete" onclick={() => ondelete?.(node)}>
    <Icon name="trash" size={13} />
  </button>
</div>

{#if renaming}
  <form class="rename-item" style:padding-left={`${depth * 14 + 4}px`} onsubmit={submitRename}>
    <input
      use:autofocus
      bind:value={draftName}
      onkeydown={(event) => event.key === 'Escape' && (renaming = false)}
      onblur={() => (renaming = false)}
    />
  </form>
{/if}

{#if isContainer && expanded}
  {#if creatingIn}
    <form
      class="new-item"
      style:padding-left={`${(depth + 1) * 14 + 8}px`}
      onsubmit={submitCreateIn}
    >
      <input
        use:autofocus
        bind:value={newName}
        placeholder="note name"
        onkeydown={(event) => event.key === 'Escape' && (creatingIn = false)}
        onblur={() => (creatingIn = false)}
      />
    </form>
  {/if}
  {#each node.children ?? [] as child (child.path)}
    <TreeItem
      node={child}
      {current}
      depth={depth + 1}
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
