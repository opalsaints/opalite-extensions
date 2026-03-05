/**
 * Opalite Extension UI — Entry Point
 *
 * This module initializes new Opalite UI components that run alongside
 * the existing main.js panel inside the Shadow DOM.
 *
 * It waits for the panel's shadow root to be available, then mounts
 * new React components into designated mount points.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { OpaliteOverlay } from './components/OpaliteOverlay';

// CSS will be injected into the shadow root
import './styles/opalite-ui.css';

/**
 * Wait for the shadow root to be available, then mount components.
 * The shadow root is created by main.js's wB() function.
 */
function init(): void {
  const MAX_RETRIES = 50;
  const RETRY_INTERVAL = 200;
  let retries = 0;

  function tryMount(): void {
    // Look for the shadow host created by main.js
    const shadowHost = document.getElementById('opalite-shadow-host');
    const shadowRoot = shadowHost?.shadowRoot;

    if (shadowRoot) {
      // Find or create mount point inside .opalite-inner for dark mode support
      const inner = shadowRoot.querySelector('.opalite-inner') || shadowRoot;
      let mountPoint = shadowRoot.querySelector('#opalite-ui-mount') as HTMLElement | null;
      if (!mountPoint) {
        mountPoint = document.createElement('div');
        mountPoint.id = 'opalite-ui-mount';
        inner.appendChild(mountPoint);
      }

      // Mount React
      const root = createRoot(mountPoint);
      root.render(
        <React.StrictMode>
          <OpaliteOverlay />
        </React.StrictMode>
      );

      console.log('[Opalite UI] Mounted successfully inside shadow root');
      return;
    }

    // Fallback: if no shadow root yet (Phase 2 not applied), mount to body
    if (retries >= MAX_RETRIES) {
      const autoRoot = document.querySelector('.auto-midjourney-root');
      if (autoRoot) {
        let mountPoint = autoRoot.querySelector('#opalite-ui-mount');
        if (!mountPoint) {
          mountPoint = document.createElement('div');
          mountPoint.id = 'opalite-ui-mount';
          autoRoot.appendChild(mountPoint);
        }
        const root = createRoot(mountPoint);
        root.render(
          <React.StrictMode>
            <OpaliteOverlay />
          </React.StrictMode>
        );
        console.log('[Opalite UI] Mounted to .auto-midjourney-root (no shadow root)');
      } else {
        console.warn('[Opalite UI] Could not find mount point after retries');
      }
      return;
    }

    retries++;
    setTimeout(tryMount, RETRY_INTERVAL);
  }

  // Start looking for mount point
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryMount);
  } else {
    tryMount();
  }
}

// Auto-initialize
init();
