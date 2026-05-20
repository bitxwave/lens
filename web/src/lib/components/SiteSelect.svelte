<script lang="ts">
  import { siteList, type ISite } from '$lib/constants/nav';
  import { siteStore } from '$lib/store/siteStore';

  let visible = $state(false);

  function handleBtnClick(evt: Event) {
    evt.stopPropagation();
    visible = !visible;
  }

  function handleItemClick(s: ISite) {
    siteStore.set(s);
    visible = false;
  }

  function handleWindowClick() {
    visible = false;
  }
</script>

<svelte:window onclick={handleWindowClick} />

<div class={`site-select ${visible ? 'site-select-show' : ''}`}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="site-select-btn" onclick={handleBtnClick}>{$siteStore?.name ?? ''}</div>
  <div class="site-select-list">
    {#each siteList as siteItem}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class={`site-select-list-item ${$siteStore.value === siteItem.value ? 'site-select-list-item-active' : ''}`}
        onclick={(evt) => {
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
        background-color: rgba(153, 182, 241, 0.5);
        cursor: pointer;

        &:hover,
        &-active {
          background-color: rgba(153, 182, 241, 1);
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
    .site-select {
      &-list {
        width: 100vw;
        top: 44px;
        right: 0;
        border-radius: 0;
      }
    }
  }
</style>
