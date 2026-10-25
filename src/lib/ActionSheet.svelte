<script>
  import { fly } from 'svelte/transition';
  import Icon from './Icon.svelte';

  let { title, actions = [], onclose } = $props();

  function run(action) {
    onclose?.();
    action.onclick?.();
  }
</script>

<button class="sheet-backdrop" tabindex="-1" aria-label="Close" onclick={onclose}></button>

<div
  class="action-sheet"
  role="dialog"
  aria-label={title ?? 'Actions'}
  transition:fly={{ y: 420, duration: 220 }}
>
  <div class="sheet-grab"></div>
  {#if title}
    <p class="sheet-title">{title}</p>
  {/if}
  {#each actions as action (action.label)}
    <button class="sheet-action" class:danger={action.danger} onclick={() => run(action)}>
      <span class="sheet-action-icon"><Icon name={action.icon} size={16} /></span>
      {action.label}
    </button>
  {/each}
  <button class="sheet-action cancel" onclick={onclose}>Cancel</button>
</div>
