/**
 * Multi-pass build script for DA Stash Helper Chrome extension.
 *
 * Why not a single Vite build?
 * - Content scripts MUST be classic scripts (IIFE) — Chrome injects them
 *   as non-module scripts, so `import` statements are a syntax error.
 * - Service worker uses ES modules (type: "module" in manifest).
 *
 * Vite/Rollup can't mix output formats in a single build, so we run
 * two sequential builds with different configs.
 *
 * Hot-reload (--watch mode):
 *   node build.mjs --watch
 *   Starts a WebSocket server on port 8976. The service worker connects
 *   and calls chrome.runtime.reload() when the build finishes.
 *   The reload-client is prepended to the service worker bundle (dev only).
 */

import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { watch as fsWatch } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch') || process.argv.includes('-w');

/** Shared path aliases (must match tsconfig.json) */
const aliases = {
  '@platform': resolve(__dirname, 'src/platform'),
  '@core': resolve(__dirname, 'src/core'),
  '@automation': resolve(__dirname, 'src/automation'),
  '@ui': resolve(__dirname, 'src/ui'),
  '@shared': resolve(__dirname, 'src/shared'),
  '@integration': resolve(__dirname, 'src/integration'),
};

// ── Hot-reload server (watch mode only) ──

let notifyReload = () => {};
if (isWatch) {
  const { startReloadServer, notifyReload: notify } = await import('./scripts/reload-server.mjs');
  startReloadServer();
  notifyReload = notify;
}

// ── Dev version auto-increment (watch mode only) ──
// Chrome extension versions support up to 4 segments: major.minor.patch.build
// In watch mode we append an auto-incrementing build number so Chrome sees each
// reload as a version bump (e.g., 2.0.0.1 → 2.0.0.2 → 2.0.0.3).
// The source manifest.json keeps its base version (e.g., 2.0.0) unchanged.

/** Read the current build number from dist/manifest.json before emptyOutDir wipes it. */
function readPreviousBuildNum(baseVersion) {
  if (!isWatch) return 0;

  const distManifestPath = resolve(__dirname, 'dist/manifest.json');
  if (!existsSync(distManifestPath)) return 0;

  try {
    const distManifest = JSON.parse(readFileSync(distManifestPath, 'utf-8'));
    const parts = distManifest.version.split('.').map(Number);
    if (parts.length === 4) {
      const baseParts = baseVersion.split('.').map(Number);
      const baseMatches = parts[0] === baseParts[0] && parts[1] === baseParts[1] && parts[2] === baseParts[2];
      if (baseMatches) return parts[3];
    }
  } catch { /* ignore */ }
  return 0;
}

function getDevVersion(baseVersion, prevBuildNum) {
  if (!isWatch) return baseVersion;
  return `${baseVersion}.${prevBuildNum + 1}`;
}

// ── Build function ──

async function runBuild() {
  const startTime = Date.now();
  console.log(isWatch ? '\n[build] Rebuilding...' : '=== DA Stash Helper — Multi-pass Build ===\n');

  // Read the base version and previous build number BEFORE emptyOutDir wipes dist/
  const srcManifest = JSON.parse(readFileSync(resolve(__dirname, 'src/manifest.json'), 'utf-8'));
  const prevBuildNum = readPreviousBuildNum(srcManifest.version);

  // ── Pass 1: Content Script (IIFE — self-contained, zero imports) ──

  console.log('[1/2] Building content script (IIFE)...');
  await build({
    configFile: false,
    resolve: { alias: aliases },
    build: {
      emptyOutDir: true,
      outDir: 'dist',
      lib: {
        entry: resolve(__dirname, 'src/entrypoints/content-script.ts'),
        formats: ['iife'],
        name: 'DAStashHelper',
        fileName: () => 'content-script.js',
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
      minify: 'esbuild',
    },
    logLevel: 'warn',
  });

  // ── Pass 2: Service Worker (ES module) ──

  // In watch mode, prepend the reload client to the service worker
  const swBanner = isWatch
    ? readFileSync(resolve(__dirname, 'scripts/reload-client.js'), 'utf-8') + '\n'
    : '';

  console.log('[2/2] Building service worker (ESM)...');
  await build({
    configFile: false,
    resolve: { alias: aliases },
    build: {
      emptyOutDir: false,
      outDir: 'dist',
      lib: {
        entry: resolve(__dirname, 'src/entrypoints/service-worker.ts'),
        formats: ['es'],
        fileName: () => 'service-worker.js',
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          banner: swBanner,
        },
      },
      minify: 'esbuild',
    },
    logLevel: 'warn',
  });

  // ── Post-build: Copy manifest + icons ──

  console.log('[post] Copying manifest.json and icons...');

  const distDir = resolve(__dirname, 'dist');
  const manifest = JSON.parse(readFileSync(resolve(__dirname, 'src/manifest.json'), 'utf-8'));
  manifest.version = getDevVersion(manifest.version, prevBuildNum);
  manifest.background.service_worker = 'service-worker.js';
  manifest.content_scripts[0].js = ['content-script.js'];
  delete manifest.side_panel;
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

  // In watch mode, allow WebSocket connection for reload client
  if (isWatch) {
    manifest.content_security_policy = {
      extension_pages: "script-src 'self'; object-src 'self'; connect-src ws://localhost:8976",
    };
  }

  writeFileSync(resolve(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const iconsDir = resolve(distDir, 'icons');
  if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
  for (const size of ['16', '48', '128']) {
    const src = resolve(__dirname, `public/icons/icon-${size}.png`);
    if (existsSync(src)) {
      copyFileSync(src, resolve(iconsDir, `icon-${size}.png`));
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[done] Build complete in ${elapsed}ms — v${manifest.version}`);

  return true;
}

// ── Single build or watch mode ──

await runBuild();

if (isWatch) {
  // Notify any connected extension to reload
  notifyReload();

  console.log('\n[watch] Watching src/ and scripts/ for changes... (Ctrl+C to stop)');
  console.log('[watch] Extension will auto-reload on rebuild\n');

  // Debounced file watcher
  let rebuildTimer = null;
  let building = false;

  function onFileChange(_event, filename) {
    if (!filename || building) return;
    // Ignore non-source files
    if (!/\.(ts|tsx|css|html|json|js|mjs)$/.test(filename)) return;

    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(async () => {
      building = true;
      try {
        await runBuild();
        notifyReload();
      } catch (err) {
        console.error('[watch] Build failed:', err.message);
      }
      building = false;
    }, 300);
  }

  // Watch src/ (main source) and scripts/ (reload client, build deps)
  fsWatch(resolve(__dirname, 'src'), { recursive: true }, onFileChange);
  fsWatch(resolve(__dirname, 'scripts'), { recursive: true }, onFileChange);
} else {
  console.log('\n=== Build complete ===');
  console.log('Output: dist/');
  console.log('  - content-script.js  (IIFE — injected by Chrome)');
  console.log('  - service-worker.js  (ES module)');
  console.log('  - manifest.json      (processed)');
  console.log('  - icons/             (extension icons)');
  console.log('\nTip: Use --watch for auto-reload during development');
}
