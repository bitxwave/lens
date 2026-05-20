<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy } from 'svelte';
  import { siteList, type ISite } from '$lib/constants/nav';
  // import { isURL } from '$lib/utils/index';
  import { siteStore } from '$lib/store/siteStore';

  let site = get(siteStore);

  const unsubscribe = siteStore.subscribe((siteInfo: ISite) => {
    site = siteInfo;
  });

  let visible = false;

  const handleBtnClick = (evt: Event) => {
    evt.stopPropagation();
    visible = !visible;
  }

  const handleItemClick = (site: ISite) => {
    siteStore.set(site);
    visible = false;
  };

  const handleWindowClick = () => {
    visible = false;
  }

  onDestroy(() => {
    unsubscribe();
  });
</script>

<svelte:window on:click={handleWindowClick} />

<div class={`site-select ${visible ? 'site-select-show' : ''}`}>
  <div class="site-select-btn" on:click={handleBtnClick}>{site?.name || ''}</div>
  <div class={`site-select-list`}>
    {#each siteList as siteItem}
    <div
      class={`site-select-list-item ${site.value === siteItem.value ? 'site-select-list-item-active' : ''}`}
      on:click={(evt) => {
        evt.stopPropagation();
        handleItemClick(siteItem);
      }}
    >
      <!-- {#if siteItem.icon }
        <div class="nav-item-icon">
          <img src={isURL(siteItem.icon) ? siteItem.icon : `/navIcons/${siteItem.icon}`} alt={siteItem.name} />
        </div>
      {/if} -->
      <div class="nav-item-name">
        {siteItem.name || ''}
      </div>
    </div>
  {/each}
  </div>
</div>

<style lang="scss">
  .site-select {
    position: relative;
    display: flex;
    flex-direction: column;
    
    &-btn {
      display: flex;
      justify-content: center;
      align-items: center;
      width: fit-content;
      padding: 5px 12px;
      margin-right: 24px;
      color: var(--text-color);
      background-color: #99b6f1;
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
    }

    &-list {
      position: absolute;
      top: 33px;
      right: 24px;
      display: none;
      flex-direction: column;
      width: 100px;
      min-height: 50px;
      max-height: 300px;
      border-radius: 4px;
      overflow-y: auto;
      overflow-y: overlay;

      &-item {
        display: flex;
        align-items: center;
        width: 100%;
        padding: 5px 12px;
        color: var(--text-color);
        background-color: rgba(153,182,241,0.5);
        cursor: pointer;

        &:hover,
        &-active {
          background-color: rgba(153,182,241,1.0);
        }
      }
    }
    
    &-show {
      .site-select-list {
        display: flex;
      }
    }
  }

  @media only screen and (max-width: 500px) {
    .site-select{
      &-list {
        width: 100vw;
        top: 44px;
        right: 0;
        border-radius: 0;
      }
    }
  }
</style>
