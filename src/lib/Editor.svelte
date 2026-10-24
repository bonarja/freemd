<script>
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { render } from './markdown.js';

  let { file, content = $bindable(''), mode = $bindable('edit'), dirty = false, onsave } = $props();

  const base = $derived(file?.path ? file.path.split('/').slice(0, -1).join('/') : '');
  const html = $derived(file?.text ? render(content, base) : '');
  const words = $derived(
    file?.text ? (content.trim() ? content.trim().split(/\s+/).length : 0) : 0
  );

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
    <span class="count">{words} palabras</span>
    <div class="seg">
      <button class:active={mode === 'edit'} onclick={() => (mode = 'edit')}>Edición</button>
      <button class:active={mode === 'preview'} onclick={() => (mode = 'preview')}>Vista</button>
    </div>
    <button class="save-btn" onclick={onsave} disabled={!dirty}>
      <Icon name="save" size={14} />
      Guardar
    </button>
  </header>
  {#if mode === 'edit'}
    <textarea
      class="code"
      bind:value={content}
      onkeydown={handleTab}
      spellcheck="false"
    ></textarea>
  {:else}
    <div class="preview-wrap">
      <article class="preview">
        {@html html}
      </article>
    </div>
  {/if}
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
