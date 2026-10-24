<script>
  import TreeItem from './TreeItem.svelte';
  import Icon from './Icon.svelte';

  let { tree, current, root, uploadDir, createRequest = 0, onopen, oncreate, onpick, ondelete, onrename } = $props();

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
      <button class="icon-btn" title="Nueva nota" onclick={() => startCreating('note')}>
        <Icon name="note" size={16} />
      </button>
      <button class="icon-btn" title="Nueva carpeta" onclick={() => startCreating('folder')}>
        <Icon name="folder" size={16} />
      </button>
      <button
        class="icon-btn"
        title="Añadir recurso a la nota actual"
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
        placeholder={creating.type === 'note' ? 'nombre de la nota' : 'nombre de la carpeta'}
        onkeydown={(event) => event.key === 'Escape' && cancelCreating()}
      />
    </form>
  {/if}

  <nav class="tree">
    {#if tree === null}
      <p class="tree-loading">Cargando…</p>
    {:else if tree.length === 0}
      <p class="tree-empty">Sin notas todavía.<br />Crea la primera con el botón de arriba.</p>
    {:else}
      {#each tree as node (node.path)}
        <TreeItem {node} {current} depth={0} {onopen} {ondelete} {onrename} />
      {/each}
    {/if}
  </nav>

  <div class="side-foot">
    <button class="upload-btn" onclick={() => onpick?.()} disabled={uploadDir === null}>
      <Icon name="upload" size={14} />
      Añadir recurso
    </button>
    <span class="root-hint" title="Carpeta de notas">{root}</span>
  </div>
</aside>
