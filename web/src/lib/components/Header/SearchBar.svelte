<script lang="ts">
  import { onMount } from 'svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { searchQuery } from '$lib/stores/visible';
  import { t } from '$lib/i18n/store';

  let inputEl: HTMLDivElement | undefined = $state();

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        const realInput = inputEl?.querySelector?.('input') ?? inputEl;
        (realInput as HTMLInputElement | null)?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<div class="search" bind:this={inputEl}>
  <Input
    type="search"
    placeholder={$t('header.search.placeholder')}
    bind:value={$searchQuery}
    fullWidth
  />
</div>

<style lang="scss">
  .search {
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
  }
</style>
