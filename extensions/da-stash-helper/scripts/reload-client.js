/**
 * Dev hot-reload client — injected into the service worker during dev builds.
 *
 * Connects to the reload server (ws://localhost:8976) and calls
 * chrome.runtime.reload() when it receives a "reload" message.
 * After the extension restarts, it detects a pending-reload flag in
 * session storage and refreshes all DeviantArt/Sta.sh tabs so the
 * content scripts are re-injected with the new code.
 *
 * This file is prepended to the service worker bundle by build.mjs
 * when --watch mode is active. It is NOT included in production builds.
 */

/* eslint-disable no-undef */
(function _devReloadClient() {
  const RELOAD_WS = 'ws://localhost:8976';
  const CONTENT_SCRIPT_URLS = ['https://*.deviantart.com/*', 'https://sta.sh/*'];
  let ws;
  let reconnectTimer;

  // ── On startup: check if a hot-reload just happened and refresh affected tabs ──
  chrome.storage.session.get('_devReloadPending', (result) => {
    if (result._devReloadPending) {
      chrome.storage.session.remove('_devReloadPending');
      chrome.tabs.query({ url: CONTENT_SCRIPT_URLS }, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) chrome.tabs.reload(tab.id);
        }
        console.log(`[dev-reload] Refreshed ${tabs.length} affected tab(s)`);
      });
    }
  });

  // ── WebSocket connection to build server ──

  function connect() {
    try {
      ws = new WebSocket(RELOAD_WS);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      console.log('[dev-reload] Connected to reload server');
    });

    ws.addEventListener('message', (event) => {
      if (event.data === 'reload') {
        console.log('[dev-reload] Reloading extension…');
        // Set flag so the next service worker startup refreshes affected tabs
        chrome.storage.session.set({ _devReloadPending: true }, () => {
          chrome.runtime.reload();
        });
      }
    });

    ws.addEventListener('close', () => {
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      try { ws.close(); } catch { /* ignore */ }
    });
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 2000);
  }

  connect();

  // Keep service worker alive while WebSocket is connected
  setInterval(() => {
    if (ws && ws.readyState === 1) {
      ws.send('ping');
    }
  }, 20_000);
})();
