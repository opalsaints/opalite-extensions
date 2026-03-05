import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

/**
 * Custom Chrome Extension build plugin.
 *
 * Replaces @crxjs/vite-plugin (which has broken content script loading in beta).
 * Builds everything as self-contained bundles:
 *   - Content script: IIFE, single file, no dynamic imports
 *   - Service worker: ES module, single file
 *   - Side panel: Standard Vite HTML page
 */
function chromeExtension(): Plugin {
  return {
    name: 'chrome-extension-build',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');

      // Copy manifest.json with corrected paths
      const manifest = JSON.parse(readFileSync(resolve(__dirname, 'src/manifest.json'), 'utf-8'));

      // Fix paths for dist output
      manifest.background.service_worker = 'service-worker.js';
      manifest.content_scripts[0].js = ['content-script.js'];
      manifest.side_panel.default_path = 'side-panel.html';
      manifest.action.default_icon = {
        '16': 'icons/icon-16.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      };
      manifest.icons = {
        '16': 'icons/icon-16.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      };

      // Content script needs web_accessible_resources for CSS injection
      // but NOT for the script itself (it's directly referenced in manifest)
      // No use_dynamic_url needed.

      writeFileSync(resolve(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Copy icons
      const iconsDir = resolve(distDir, 'icons');
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
      for (const size of ['16', '48', '128']) {
        const src = resolve(__dirname, `public/icons/icon-${size}.png`);
        if (existsSync(src)) {
          copyFileSync(src, resolve(iconsDir, `icon-${size}.png`));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [chromeExtension()],
  resolve: {
    alias: {
      '@platform': resolve(__dirname, 'src/platform'),
      '@core': resolve(__dirname, 'src/core'),
      '@automation': resolve(__dirname, 'src/automation'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@integration': resolve(__dirname, 'src/integration'),
    },
  },
  build: {
    // Don't empty outDir — we build multiple times
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'content-script': resolve(__dirname, 'src/entrypoints/content-script.ts'),
        'service-worker': resolve(__dirname, 'src/entrypoints/service-worker.ts'),
        'side-panel': resolve(__dirname, 'src/ui/side-panel.html'),
      },
      output: {
        // Flat output — all files in dist root
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]',
        // CRITICAL: Prevent code splitting.
        // Content scripts can't load shared chunks via import().
        // Force all shared modules to be inlined into each entry point.
        manualChunks: () => undefined,
      },
    },
  },
});
