<script>
  import TreeItem from './TreeItem.svelte';
  import Icon from './Icon.svelte';

  let { node, current, depth = 0, onopen, ondelete, onrename } = $props();

  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);

  let toggled = $state(null);
  let renaming = $state(false);
  let draftName = $state('');

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

  function handleClick() {
    if (!isContainer) {
      onopen?.(node);
      return;
    }
    toggled = !expanded;
  }

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

  function autofocus(input) {
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }
</script>

{#if renaming}
  <form class="rename-item" style:padding-left={`${depth * 14 + 4}px`} onsubmit={submitRename}>
    <input
      use:autofocus
      bind:value={draftName}
      onkeydown={(event) => event.key === 'Escape' && (renaming = false)}
      onblur={() => (renaming = false)}
    />
  </form>
{:else}
  <div class="item" class:active>
    <button class="row" style:padding-left={`${depth * 14 + 8}px`} onclick={handleClick} title={node.path}>
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
    <button class="del" title="Rename" onclick={startRenaming}>
      <Icon name="pencil" size={13} />
    </button>
    <button class="del" title="Delete" onclick={() => ondelete?.(node)}>
      <Icon name="trash" size={13} />
    </button>
  </div>
{/if}

{#if isContainer && expanded}
  {#each node.children ?? [] as child (child.path)}
    <TreeItem node={child} {current} depth={depth + 1} {onopen} {ondelete} {onrename} />
  {/each}
{/if}
