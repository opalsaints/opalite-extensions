#!/usr/bin/env node
/**
 * Standalone reload server — keeps running and relays reload signals
 * to connected Chrome extensions.
 *
 * Usage:
 *   node scripts/reload-server.mjs
 *
 * Then in another terminal (or from Claude):
 *   node scripts/dev-build.mjs gemini
 *
 * The dev-build script detects the running server and sends its reload
 * signal through it.
 */

import { WebSocketServer } from 'ws';

const PORT = 8976;
const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.log(`[reload-server] Listening on ws://localhost:${PORT}`);
  console.log('[reload-server] Waiting for extensions to connect...');
});

wss.on('connection', (ws) => {
  console.log(`[reload-server] Client connected (total: ${wss.clients.size})`);

  ws.on('message', (data) => {
    const msg = data.toString();
    if (msg === 'ping') return; // Keep-alive from extension
    if (msg === 'trigger-reload') {
      // Relay from dev-build.mjs to all extension clients
      let sent = 0;
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === 1) {
          client.send('reload');
          sent++;
        }
      }
      console.log(`[reload-server] Relayed reload to ${sent} extension(s)`);
    }
  });

  ws.on('close', () => {
    console.log(`[reload-server] Client disconnected (remaining: ${wss.clients.size})`);
  });
});

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[reload-server] Port ${PORT} already in use`);
  } else {
    console.error('[reload-server] Error:', err.message);
  }
  process.exit(1);
});
