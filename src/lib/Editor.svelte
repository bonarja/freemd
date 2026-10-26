<script>
  import { tick } from 'svelte';
  import { fly, slide } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import ActionSheet from './ActionSheet.svelte';
  import { render } from './markdown.js';
  import hljs from 'highlight.js/lib/core';
  import markdownLang from 'highlight.js/lib/languages/markdown';
  import xmlLang from 'highlight.js/lib/languages/xml';

  // El grammar de markdown usa xml como sublenguaje (HTML embebido).
  hljs.registerLanguage('markdown', markdownLang);
  hljs.registerLanguage('xml', xmlLang);

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
    isMobile = false,
    onsave,
    onpick,
    onexport,
    onremove,
    onpasteimage
  } = $props();

  let textareaEl = $state(null);
  let hlEl = $state(null);
  let previewEl = $state(null);
  let exportOpen = $state(false);
  let resourceSheet = $state(null);

  // Corrector ortográfico del navegador, opt-in y persistido.
  let spellcheck = $state(localStorage.getItem('freemd:spellcheck:v1') === '1');

  $effect(() => {
    localStorage.setItem('freemd:spellcheck:v1', spellcheck ? '1' : '0');
  });

  const base = $derived(file?.path ? file.path.split('/').slice(0, -1).join('/') : '');
  const html = $derived(file?.text ? render(content, base) : '');
  const words = $derived(
    file?.text ? (content.trim() ? content.trim().split(/\s+/).length : 0) : 0
  );

  // Notas enormes: se muestran sin color antes que congelar la edición.
  const HIGHLIGHT_LIMIT = 120_000;

  function escapeHtml(text) {
    return text.replace(
      /[&<>]/g,
      (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;')
    );
  }

  // El textarea vive con el texto transparente sobre este <pre> resaltado.
  const highlighted = $derived.by(() => {
    if (!file?.text) return '';
    let out;
    try {
      out =
        content.length <= HIGHLIGHT_LIMIT
          ? hljs.highlight(content, { language: 'markdown' }).value
          : escapeHtml(content);
    } catch {
      out = escapeHtml(content);
    }
    // Cuando el valor acaba en \n, el textarea pinta una última línea vacía
    // que el <pre> colapsa: el salto extra iguala la altura de ambas capas.
    return out + '\n';
  });

  // En móvil tocar un recurso abre el action sheet (insertar/eliminar).
  function chooseResource(resource) {
    if (isMobile) {
      resourceSheet = resource;
      return;
    }
    insertResource(resource);
  }

  const resourceSheetActions = $derived.by(() => {
    if (!resourceSheet) return [];
    // Snapshot: onclose() pone resourceSheet en null ANTES de ejecutar la acción.
    const resource = resourceSheet;
    return [
      {
        label: 'Insert into note',
        icon: resource.type === 'image' ? 'image' : 'file',
        onclick: () => {
          insertResource(resource);
          if (isMobile) panelOpen = false;
        }
      },
      {
        label: 'Delete resource',
        icon: 'trash',
        danger: true,
        onclick: () => onremove?.(resource)
      }
    ];
  });

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

  // Sincroniza el scroll de la capa de highlight y, en split, el del preview.
  function syncScroll(event) {
    const el = event.currentTarget;
    if (hlEl) {
      hlEl.scrollTop = el.scrollTop;
      hlEl.scrollLeft = el.scrollLeft;
    }
    if (mode !== 'split' || !previewEl) return;
    const range = Math.max(1, el.scrollHeight - el.clientHeight);
    const ratio = el.scrollTop / range;
    previewEl.scrollTop = ratio * Math.max(0, previewEl.scrollHeight - previewEl.clientHeight);
  }

  // Pega imágenes del portapapeles: las sube como recursos y las inserta.
  // Con texto en el portapapeles se deja el comportamiento por defecto.
  // El panel de recursos entra desde abajo en móvil y desde la derecha en desktop.
  function panelTransition(node) {
    return isMobile ? fly(node, { y: 560, duration: 240 }) : slide(node, { duration: 180, axis: 'x' });
  }

  // En móvil el modo Split no existe: si se llega con split activo, se vuelve a Edit.
  $effect(() => {
    if (isMobile && mode === 'split') mode = 'edit';
  });

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
      aria-label="Toggle resources panel"
      onclick={() => (panelOpen = !panelOpen)}
      disabled={!resourcesEnabled}
    >
      <Icon name="image" size={15} />
    </button>
    <button
      class="icon-btn spell-btn"
      class:active={spellcheck}
      title={spellcheck ? 'Spell check: on' : 'Spell check: off'}
      aria-label="Toggle spell check"
      aria-pressed={spellcheck}
      onclick={() => (spellcheck = !spellcheck)}
    >
      <Icon name="spell-check" size={15} />
    </button>
    <div class="seg">
      <button class:active={mode === 'edit'} onclick={() => (mode = 'edit')}>Edit</button>
      <button class="split-btn" class:active={mode === 'split'} onclick={() => (mode = 'split')}>
        Split
      </button>
      <button class:active={mode === 'preview'} onclick={() => (mode = 'preview')}>Preview</button>
    </div>
    <button class="save-btn" onclick={() => onsave?.()} disabled={!dirty} aria-label="Save">
      <Icon name="save" size={14} />
      <span class="btn-label">Save</span>
    </button>
    <div class="export-wrap">
      <button
        class="save-btn"
        onclick={() => (exportOpen = !exportOpen)}
        disabled={!file?.text}
        aria-label="Export"
      >
        <Icon name="download" size={14} />
        <span class="btn-label">Export</span>
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
  <div class="editor-body" class:split={mode === 'split'}>
    {#if mode !== 'preview'}
      <div class="code-shell" class:half={mode === 'split'}>
        <pre class="hl-layer" aria-hidden="true" bind:this={hlEl}>{@html highlighted}</pre>
        <textarea
          class="code"
          bind:this={textareaEl}
          bind:value={content}
          onkeydown={handleTab}
          onscroll={syncScroll}
          spellcheck={spellcheck}
        ></textarea>
      </div>
    {/if}
    {#if mode !== 'edit'}
      <div class="preview-wrap" class:half={mode === 'split'} bind:this={previewEl}>
        <article class="preview">
          {@html html}
        </article>
      </div>
    {/if}
    {#if panelOpen && isMobile}
      <button
        class="panel-backdrop"
        aria-label="Close resources panel"
        tabindex="-1"
        onclick={() => (panelOpen = false)}
      ></button>
    {/if}
    {#if panelOpen}
      <aside class="resources" transition:panelTransition>
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
                  onclick={() => chooseResource(resource)}
                  onkeydown={(event) =>
                    (event.key === 'Enter' || event.key === ' ') && chooseResource(resource)}
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
  {#if resourceSheet}
    <ActionSheet
      title={resourceSheet.name}
      actions={resourceSheetActions}
      onclose={() => (resourceSheet = null)}
    />
  {/if}
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
