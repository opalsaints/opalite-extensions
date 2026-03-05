import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite build config for Opalite Extension UI components.
 *
 * Outputs a single IIFE bundle (opalite-ui.js) that can be loaded
 * as a content script alongside main.js. CSS is inlined into the JS
 * bundle for Shadow DOM injection compatibility.
 *
 * React is EXTERNALIZED — shared from main.js's bundled React via
 * window globals. This saves ~100KB in bundle size.
 *
 * Build targets: GeminiExt, GrokExt, ChatGPTExt
 */
export default defineConfig({
  plugins: [
    react({
      // Use the classic runtime since we're externalizing React
      jsxRuntime: 'classic',
    }),
  ],

  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      formats: ['iife'],
      name: 'OpaliteUI',
      fileName: () => 'opalite-ui.js',
    },

    // Output to GeminiExt by default; build.sh copies to other extensions
    outDir: resolve(__dirname, '../GeminiExt/scripts'),

    // Don't clear the output dir (it contains main.js, style.css, etc.)
    emptyOutDir: false,

    // Inline CSS into JS for Shadow DOM compatibility
    cssCodeSplit: false,

    // Target Chrome 90+ (MV3 requirement)
    target: 'chrome90',

    rollupOptions: {
      // Externalize React — it's provided by main.js's bundle
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      output: {
        // Map externals to window globals from main.js's React
        globals: {
          'react': '__opaliteReact',
          'react-dom': '__opaliteReactDOM',
          'react-dom/client': '__opaliteReactDOM',
          'react/jsx-runtime': '__opaliteReactJSX',
        },
        // Ensure CSS is inlined, not extracted
        assetFileNames: 'opalite-ui.[ext]',
      },
    },

    // Minify for production
    minify: 'esbuild',

    // Generate source maps for debugging
    sourcemap: true,
  },

  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
