/**
 * Dev hot-reload client for Opalite extensions.
 *
 * Connects to a WebSocket server on ws://localhost:8976 and calls
 * chrome.runtime.reload() when it receives a "reload" message.
 * After reload, refreshes all tabs matching the extension's target URLs.
 *
 * If no server is running (production), the connection silently fails
 * and retries every 5 seconds. Overhead is negligible — one failed
 * WebSocket connection attempt every 5s.
 *
 * Adapted from da-stash-helper/scripts/reload-client.js.
 */

const RELOAD_WS = 'ws://localhost:8976';

export function setupDevReload(targetUrls: string[]): void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  // On startup: check if a hot-reload just happened and refresh affected tabs
  chrome.storage.session.get('_devReloadPending', (result) => {
    if (result._devReloadPending) {
      chrome.storage.session.remove('_devReloadPending');
      chrome.tabs.query({ url: targetUrls }, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) chrome.tabs.reload(tab.id);
        }
        if (tabs.length > 0) {
          console.log(`[dev-reload] Refreshed ${tabs.length} affected tab(s)`);
        }
      });
    }
  });

  function connect(): void {
    try {
      ws = new WebSocket(RELOAD_WS);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      console.log('[dev-reload] Connected to reload server');
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      if (event.data === 'reload') {
        console.log('[dev-reload] Reloading extension…');
        chrome.storage.session.set({ _devReloadPending: true }, () => {
          chrome.runtime.reload();
        });
      }
    });

    ws.addEventListener('close', () => {
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    });
  }

  function scheduleReconnect(): void {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 5000);
  }

  connect();

  // Keep service worker alive while connected
  setInterval(() => {
    if (ws && ws.readyState === 1) {
      ws.send('ping');
    }
  }, 20_000);
}
