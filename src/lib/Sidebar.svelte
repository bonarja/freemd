<script>
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
    onrenamehandled
  } = $props();

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
</script>

<aside class="sidebar">
  <div class="side-head">
    <span class="brand">free<span class="brand-md">md</span></span>
    <div class="head-actions">
      <button class="icon-btn" title="New note" onclick={() => startCreating('note')}>
        <Icon name="note" size={16} />
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
    </div>
  </div>

  {#if creating}
    <form class="new-item" onsubmit={submitCreating}>
      <input
        use:autofocus
        bind:value={name}
        placeholder={creating.type === 'note' ? 'note name' : 'folder name'}
        onkeydown={(event) => event.key === 'Escape' && cancelCreating()}
      />
    </form>
  {/if}

  <nav class="tree">
    {#if tree === null}
      <p class="tree-loading">Loading…</p>
    {:else if tree.length === 0}
      <p class="tree-empty">No notes yet.<br />Create your first one with the buttons above.</p>
    {:else}
      {#each tree as node (node.path)}
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
