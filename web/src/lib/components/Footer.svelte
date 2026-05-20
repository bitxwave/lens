<script lang="ts">
  import {
    siteCopyright,
    siteICPBeian,
    sitePoliceBeian,
    siteICPBeianURL,
    sitePoliceBeianURL
  } from '$lib/constants/siteInfo';
</script>

<footer class="footer">
  <div class="footer-copyright">{siteCopyright}</div>
  <div class="beian">
    <div class="footer-link">
      <a href={siteICPBeianURL} target="_blank" rel="noopener">{siteICPBeian}</a>
    </div>
    <div class="divider" />
    <div class="footer-link">
      <a href={sitePoliceBeianURL} target="_blank" rel="noopener">{sitePoliceBeian}</a>
    </div>
  </div>
</footer>

<style lang="scss">
  .footer {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 20px 0;
    margin-top: 120px;
    font-size: 13px;
    line-height: 2;
    color: var(--text-color);

    &-copyright {
      display: flex;
      justify-content: center;
    }

    .beian {
      display: grid;
      grid-template-areas: 'a b c';
      column-gap: 18px;
      justify-content: center;
      align-items: center;

      .footer-link {
        display: inline-flex;
        justify-content: center;
        a {
          color: var(--text-color);
          text-decoration: underline;
          cursor: pointer;

          &:hover {
            color: var(--text-hover-color);
          }
        }
      }

      .divider {
        width: 1px;
        height: 50%;
        background: var(--text-color);
      }
    }
  }
  @media only screen and (max-width: 500px) {
    .footer {
      margin-top: 48px;
      .beian {
        grid-template-areas:
          'a'
          'b'
          'c';
      }

      .divider {
        display: none;
      }
    }
  }
</style>
