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
    onsave,
    onpick,
    onexport
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
    const alt = resource.name.replace(/\.[^.]+$/, '');
    const snippet =
      resource.type === 'image'
        ? `![${alt}](./${encodeURIComponent(resource.name)})`
        : `[${alt}](./${encodeURIComponent(resource.name)})`;
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
</script>

{#if file?.text}
  <header class="toolbar">
    <div class="meta">
      <span class="icon t-md"><Icon name="file" size={15} /></span>
      <span class="name">{file.name}</span>
      {#if file.path !== file.name}
        <span class="crumb">{file.path}</span>
      {/if}
      {#if dirty}
        <span class="unsaved" title="Cambios sin guardar"></span>
      {/if}
    </div>
    <div class="spacer"></div>
    {#if savedFlash}
      <span class="autosaved">autoguardado</span>
    {/if}
    <span class="count">{words} palabras</span>
    <button
      class="icon-btn panel-btn"
      class:active={panelOpen}
      title="Recursos de la nota"
      onclick={() => (panelOpen = !panelOpen)}
      disabled={!resourcesEnabled}
    >
      <Icon name="image" size={15} />
    </button>
    <div class="seg">
      <button class:active={mode === 'edit'} onclick={() => (mode = 'edit')}>Edición</button>
      <button class:active={mode === 'split'} onclick={() => (mode = 'split')}>Split</button>
      <button class:active={mode === 'preview'} onclick={() => (mode = 'preview')}>Vista</button>
    </div>
    <button class="save-btn" onclick={() => onsave?.()} disabled={!dirty}>
      <Icon name="save" size={14} />
      Guardar
    </button>
    <div class="export-wrap">
      <button class="save-btn" onclick={() => (exportOpen = !exportOpen)} disabled={!file?.text}>
        <Icon name="download" size={14} />
        Exportar
        <span class="export-chev" class:open={exportOpen}>
          <Icon name="chevron-down" size={12} />
        </span>
      </button>
      {#if exportOpen}
        <button
          class="menu-backdrop"
          tabindex="-1"
          aria-label="Cerrar menú"
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
          <span>Recursos</span>
          <div class="res-actions">
            <button class="icon-btn" title="Subir archivo" onclick={() => onpick?.()}>
              <Icon name="upload" size={14} />
            </button>
            <button class="icon-btn" title="Cerrar panel" onclick={() => (panelOpen = false)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>
        {#if resources.length === 0}
          <p class="res-empty">Sin recursos en esta nota.<br />Sube imágenes con el botón de arriba.</p>
        {:else}
          <div class="res-scroll">
            <div class="res-grid">
              {#each resources as resource (resource.path)}
                <button
                  class="res-item"
                  onclick={() => insertResource(resource)}
                  title="Insertar en la nota"
                >
                  {#if resource.type === 'image'}
                    <img src={resource.mediaUrl} alt={resource.name} loading="lazy" />
                  {:else}
                    <span class="res-file"><Icon name="file" size={16} /></span>
                  {/if}
                  <span class="res-name">{resource.name}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </aside>
    {/if}
  </div>
{:else if file}
  <header class="toolbar">
    <div class="meta">
      <span class="icon t-image"><Icon name="image" size={15} /></span>
      <span class="name">{file.name}</span>
      <span class="crumb">{file.path}</span>
    </div>
  </header>
  <div class="media-view">
    <img src={file.mediaUrl} alt={file.name} />
  </div>
{/if}
