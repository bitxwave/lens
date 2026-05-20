<script lang="ts">
  import { siteName } from '$lib/constants/siteInfo';
  import { avatarURL } from '$lib/constants/avatar';
  import SiteSelect from './SiteSelect.svelte';
</script>

<header class="header">
  <a href="/" class="header-logo">
    <img src={avatarURL} alt={siteName} />
    <span class="name">{siteName}</span>
  </a>
  <SiteSelect />
</header>

<style lang="scss">
  .header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;

    &-logo {
      display: flex;
      align-items: center;
      padding: 12px 24px;
      text-decoration: none;
      outline: none;

      img {
        width: 50px;
        height: 50px;
        border-radius: 50%;
      }

      .name {
        flex-shrink: 0;
        margin-left: 14px;
        font-size: 20px;
        color: var(--text-color);

        &:hover {
          color: var(--text-hover-color);
        }
      }
    }
  }

  @media only screen and (max-width: 500px) {
    .header {
      &-logo {

        img {
          width: 36px;
          height: 36px;
        }

        .name {
          font-size: 18px;
        }
      }
    }
  }
</style>
