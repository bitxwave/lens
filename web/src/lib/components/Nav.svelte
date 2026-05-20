<script lang="ts">
  import type { INavItem } from '$lib/constants/nav';
  import { isURL } from '$lib/utils/index';
  import { availableNavListStore, siteStore } from '$lib/store/siteStore';

  function handleClick(nav: INavItem) {
    const link = nav?.link?.[$siteStore?.value || ''];
    if (link) {
      window.open(link, '_blank', 'noreferrer,noreferrer');
    }
  }
</script>

<div class="nav">
  {#each $availableNavListStore as nav}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="nav-item" onclick={() => handleClick(nav)}>
      <div class="nav-item-icon">
        <img src={isURL(nav.source) ? nav.source : `/navIcons/${nav.source}`} alt={nav.name} />
      </div>
      <div class="nav-item-name">
        {nav.name || ''}
      </div>
    </div>
  {/each}
</div>

<style lang="scss">
  @keyframes shark-bounce {
    0%,
    100% {
      transform: rotate(0);
    }
    25% {
      transform: rotate(15deg);
    }
    50% {
      transform: rotate(-15deg);
    }
    75% {
      transform: rotate(5deg);
    }
    85% {
      transform: rotate(-5deg);
    }
  }
  .nav {
    --nav-item-width: 128px;

    display: grid;
    grid-template-columns: repeat(auto-fill, var(--nav-item-width));
    gap: 50px 40px;
    justify-content: center;
    width: 100%;
    max-width: 1024px;

    &-item {
      display: flex;
      flex-direction: column;

      &-icon {
        display: flex;
        justify-content: center;
        align-items: center;
        width: var(--nav-item-width);
        height: var(--nav-item-width);
        padding: 14px;
        background-color: var(--nav-item-bg-color);
        border-radius: 24px;
        box-shadow: 0 0 20px 0px rgba(0, 0, 0, 0.5);
        overflow: hidden;
        cursor: pointer;

        img {
          width: 100%;
          height: 100%;
          border-radius: 12px;
          object-fit: contain;
          overflow: hidden;
        }

        :global(.svg-icon) {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        &:hover {
          animation: shark-bounce 0.5s alternate;
        }
      }

      &-name {
        flex: 1;
        display: flex;
        justify-content: center;
        width: var(--nav-item-width);
        margin-top: 14px;
        line-height: 32px;
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 1.5px;
        color: var(--text-color);
        text-shadow: 0px 0px 10px #111;
        white-space: nowrap;
        cursor: pointer;
      }
    }
  }

  @media only screen and (max-width: 500px) {
    .nav {
      --nav-item-width: 56px;
      gap: 28px 20px;

      &-item {
        &-icon {
          padding: 8px;
          border-radius: 12px;
        }

        &-name {
          margin-top: 8px;
          line-height: 20px;
          font-size: 14px;
          transform: scale(0.85);
        }
      }
    }
  }
</style>
