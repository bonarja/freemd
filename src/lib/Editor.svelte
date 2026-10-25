<script>
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { render } from './markdown.js';

  let {
    file,
    content = $bindable(''),
    mode = $bindable('edit'),
    dirty = false,
    savedFlash = false,
    resources = [],
    resourcesEnabled = false,
    panelOpen = $bindable(false),
    sidebarOpen = true,
    onsidebar,
    onsave,
    onpick,
    onexport,
    onremove,
    onpasteimage
  } = $props();

  let textareaEl = $state(null);
  let previewEl = $state(null);
  let exportOpen = $state(false);

  const base = $derived(file?.path ? file.path.split('/').slice(0, -1).join('/') : '');
  const html = $derived(file?.text ? render(content, base) : '');
  const words = $derived(
    file?.text ? (content.trim() ? content.trim().split(/\s+/).length : 0) : 0
  );

  async function insertResource(resource) {
    const name = resource.name ?? 'imagen';
    const alt = name.replace(/\.[^.]+$/, '');
    const snippet =
      resource.type === 'image'
        ? `![${alt}](./${encodeURIComponent(name)})`
        : `[${alt}](./${encodeURIComponent(name)})`;
    if (mode === 'preview') mode = 'edit';
    await tick();
    const el = textareaEl;
    if (!el) {
      content = content ? `${content}\n${snippet}\n` : `${snippet}\n`;
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? start;
    content = content.slice(0, start) + snippet + content.slice(end);
    await tick();
    el.focus();
    el.setSelectionRange(start + snippet.length, start + snippet.length);
  }

  function handleExport(format) {
    exportOpen = false;
    onexport?.(format);
  }

  async function handleTab(event) {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const el = event.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    content = content.slice(0, start) + '  ' + content.slice(end);
    await tick();
    el.setSelectionRange(start + 2, start + 2);
  }

  // Sincroniza el scroll del preview con el del editor (modo split).
  function syncScroll(event) {
    if (mode !== 'split' || !previewEl) return;
    const el = event.currentTarget;
    const range = Math.max(1, el.scrollHeight - el.clientHeight);
    const ratio = el.scrollTop / range;
    previewEl.scrollTop = ratio * Math.max(0, previewEl.scrollHeight - previewEl.clientHeight);
  }

  // Pega imágenes del portapapeles: las sube como recursos y las inserta.
  // Con texto en el portapapeles se deja el comportamiento por defecto.
  async function handlePaste(event) {
    if (!file?.text || !resourcesEnabled) return;
    const clipboard = event.clipboardData;
    if (!clipboard || clipboard.getData('text/plain')) return;
    const items = Array.from(clipboard.items).filter(
      (item) => item.kind === 'file' && item.type.startsWith('image/')
    );
    if (!items.length) return;
    event.preventDefault();
    for (const [index, item] of items.entries()) {
      const pasted = item.getAsFile();
      if (!pasted) continue;
      const ext = (pasted.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
      const name = `imagen-${Date.now()}${items.length > 1 ? `-${index + 1}` : ''}.${ext}`;
      const resource = await onpasteimage?.(new File([pasted], name, { type: pasted.type }));
      if (resource) await insertResource(resource);
    }
  }
</script>

<svelte:window onpaste={handlePaste} />

{#if file?.text}
  <header class="toolbar">
    <button
      class="icon-btn"
      title={sidebarOpen ? 'Hide notes (⌘B)' : 'Show notes (⌘B)'}
      onclick={() => onsidebar?.()}
    >
      <Icon name="panel" size={16} />
    </button>
    <div class="meta">
      <span class="icon t-md"><Icon name="file" size={15} /></span>
      <span class="name">{file.name}</span>
      {#if file.dir}
        <span class="crumb">{file.dir}</span>
      {/if}
      {#if dirty}
        <span class="unsaved" title="Unsaved changes"></span>
      {/if}
    </div>
    <div class="spacer"></div>
    {#if savedFlash}
      <span class="autosaved">autosaved</span>
    {/if}
    <span class="count">{words} words</span>
    <button
      class="icon-btn panel-btn"
      class:active={panelOpen}
      title="Note resources"
      onclick={() => (panelOpen = !panelOpen)}
      disabled={!resourcesEnabled}
    >
      <Icon name="image" size={15} />
    </button>
    <div class="seg">
      <button class:active={mode === 'edit'} onclick={() => (mode = 'edit')}>Edit</button>
      <button class:active={mode === 'split'} onclick={() => (mode = 'split')}>Split</button>
      <button class:active={mode === 'preview'} onclick={() => (mode = 'preview')}>Preview</button>
    </div>
    <button class="save-btn" onclick={() => onsave?.()} disabled={!dirty}>
      <Icon name="save" size={14} />
      Save
    </button>
    <div class="export-wrap">
      <button class="save-btn" onclick={() => (exportOpen = !exportOpen)} disabled={!file?.text}>
        <Icon name="download" size={14} />
        Export
        <span class="export-chev" class:open={exportOpen}>
          <Icon name="chevron-down" size={12} />
        </span>
      </button>
      {#if exportOpen}
        <button
          class="menu-backdrop"
          tabindex="-1"
          aria-label="Close menu"
          onclick={() => (exportOpen = false)}
        ></button>
        <div class="export-menu">
          <button onclick={() => handleExport('pdf')}>
            <Icon name="file" size={14} />
            PDF
          </button>
          <button onclick={() => handleExport('docx')}>
            <Icon name="file" size={14} />
            Word (.docx)
          </button>
        </div>
      {/if}
    </div>
  </header>
  <div class="editor-body">
    {#if mode !== 'preview'}
      <textarea
        class="code"
        class:half={mode === 'split'}
        bind:this={textareaEl}
        bind:value={content}
        onkeydown={handleTab}
        onscroll={syncScroll}
        spellcheck="false"
      ></textarea>
    {/if}
    {#if mode !== 'edit'}
      <div class="preview-wrap" class:half={mode === 'split'} bind:this={previewEl}>
        <article class="preview">
          {@html html}
        </article>
      </div>
    {/if}
    {#if panelOpen}
      <aside class="resources" transition:slide={{ duration: 180, axis: 'x' }}>
        <div class="res-head">
          <span>Resources</span>
          <div class="res-actions">
            <button class="icon-btn" title="Upload file" onclick={() => onpick?.()}>
              <Icon name="upload" size={14} />
            </button>
            <button class="icon-btn" title="Close panel" onclick={() => (panelOpen = false)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>
        {#if resources.length === 0}
          <p class="res-empty">No resources in this note yet.<br />Upload images with the button above.</p>
        {:else}
          <div class="res-scroll">
            <div class="res-grid">
              {#each resources as resource (resource.path)}
                <div
                  class="res-item"
                  role="button"
                  tabindex="0"
                  onclick={() => insertResource(resource)}
                  onkeydown={(event) =>
                    (event.key === 'Enter' || event.key === ' ') && insertResource(resource)}
                  title="Insert into note"
                >
                  {#if resource.type === 'image'}
                    <img src={resource.mediaUrl} alt={resource.name} loading="lazy" />
                  {:else}
                    <span class="res-file"><Icon name="file" size={16} /></span>
                  {/if}
                  <span class="res-name">{resource.name}</span>
                  <button
                    class="res-remove"
                    title="Delete resource"
                    onclick={(event) => {
                      event.stopPropagation();
                      onremove?.(resource);
                    }}
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </aside>
    {/if}
  </div>
{:else if file}
  <header class="toolbar">
    <button
      class="icon-btn"
      title={sidebarOpen ? 'Hide notes (⌘B)' : 'Show notes (⌘B)'}
      onclick={() => onsidebar?.()}
    >
      <Icon name="panel" size={16} />
    </button>
    <div class="meta">
      <span class="icon t-image"><Icon name="image" size={15} /></span>
      <span class="name">{file.name}</span>
      {#if file.dir}
        <span class="crumb">{file.dir}</span>
      {/if}
    </div>
  </header>
  <div class="media-view">
    <img src={file.mediaUrl} alt={file.name} />
  </div>
{/if}
