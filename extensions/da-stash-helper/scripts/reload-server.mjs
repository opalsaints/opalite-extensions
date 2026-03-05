/**
 * Dev hot-reload WebSocket server.
 *
 * Starts a tiny WS server on port 8976. The extension's service worker
 * connects to it. When `notifyReload()` is called (after a successful build),
 * all connected clients receive a "reload" message and call
 * `chrome.runtime.reload()`.
 *
 * Usage (from build.mjs):
 *   import { startReloadServer, notifyReload } from './scripts/reload-server.mjs';
 *   startReloadServer();
 *   // ... after build succeeds ...
 *   notifyReload();
 */

import { WebSocketServer } from 'ws';

const PORT = 8976;

/** @type {WebSocketServer | null} */
let wss = null;

export function startReloadServer() {
  if (wss) return wss;

  wss = new WebSocketServer({ port: PORT });

  wss.on('listening', () => {
    console.log(`\n[hot-reload] WebSocket server listening on ws://localhost:${PORT}`);
  });

  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[hot-reload] Port ${PORT} already in use — another dev session is running`);
    } else {
      console.error('[hot-reload] Server error:', err.message);
    }
  });

  wss.on('connection', () => {
    console.log('[hot-reload] Extension connected');
  });

  return wss;
}

export function notifyReload() {
  if (!wss) return;

  let sent = 0;
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send('reload');
      sent++;
    }
  }

  if (sent > 0) {
    console.log(`[hot-reload] Sent reload signal to ${sent} client(s)`);
  }
}
