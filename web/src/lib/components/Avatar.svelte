<script lang="ts">
  import { avatarURL } from '$lib/constants/avatar';
  import { siteName } from '$lib/constants/siteInfo';
</script>

<div class="avatar">
  <img src={avatarURL} alt={siteName} />
</div>

<style lang="scss">
  .avatar {
    display: flex;
    justify-content: center;
    align-items: center;

    img {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      overflow: hidden;
    }
  }
</style>
