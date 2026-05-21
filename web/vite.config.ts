import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin, UserConfig } from 'vite';
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Generate static/navIcons-manifest.json from the actual files in
 * static/navIcons/ so the Item editor can render a picker without hard-coding
 * a list. Runs once at config resolution (covers dev + build). */
function navIconsManifestPlugin(): Plugin {
  return {
    name: 'nav-icons-manifest',
    configResolved(cfg) {
      const dir = resolve(cfg.root, 'static/navIcons');
      try {
        const files = readdirSync(dir)
          .filter((f) => /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(f))
          .sort();
        writeFileSync(
          resolve(cfg.root, 'static/navIcons-manifest.json'),
          JSON.stringify(files, null, 2)
        );
      } catch (e) {
        cfg.logger.warn(`[nav-icons-manifest] skipped: ${(e as Error).message}`);
      }
    }
  };
}

const config: UserConfig = {
  plugins: [navIconsManifestPlugin(), sveltekit()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false
      }
    }
  }
};

export default config;
