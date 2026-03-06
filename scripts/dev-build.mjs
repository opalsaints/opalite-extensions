#!/usr/bin/env node
/**
 * Build one or more extensions and signal running instances to hot-reload.
 *
 * Usage:
 *   node scripts/dev-build.mjs gemini           # Build + reload gemini
 *   node scripts/dev-build.mjs chatgpt grok     # Build + reload multiple
 *   node scripts/dev-build.mjs all              # Build + reload all opalite
 *   node scripts/dev-build.mjs --reload-only    # Just send reload signal
 *
 * How it works:
 *   1. Starts a WebSocket server on port 8976 (if not already running)
 *   2. Builds the specified extension(s) via `pnpm build:<name>`
 *   3. Sends "reload" to all connected extension service workers
 *   4. Exits
 *
 * The extension background scripts include a reload client that connects
 * to ws://localhost:8976 and calls chrome.runtime.reload() on signal.
 */

import { WebSocketServer } from 'ws';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORT = 8976;

const EXTENSION_MAP = {
  gemini: '@opalite/gemini-extension',
  chatgpt: '@opalite/chatgpt-extension',
  grok: '@opalite/grok-extension',
  deviantart: '@opalite/deviantart-extension',
};

const args = process.argv.slice(2);
const reloadOnly = args.includes('--reload-only');
const targets = args.filter((a) => !a.startsWith('--'));

if (!reloadOnly && targets.length === 0) {
  console.error('Usage: node scripts/dev-build.mjs <gemini|chatgpt|grok|deviantart|all>');
  process.exit(1);
}

// Resolve "all" to all opalite extensions
const extensionNames =
  targets.includes('all')
    ? ['gemini', 'chatgpt', 'grok']
    : targets.filter((t) => t in EXTENSION_MAP);

// ─── WebSocket Server ────────────────────────────────

function createServer() {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port: PORT });
    wss.on('listening', () => {
      console.log(`[reload] WebSocket server on ws://localhost:${PORT}`);
      resolve(wss);
    });
    wss.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[reload] Port ${PORT} in use — will try to connect`);
        resolve(null);
      } else {
        reject(err);
      }
    });
  });
}

function sendReloadViaServer(wss) {
  let sent = 0;
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send('reload');
      sent++;
    }
  }
  console.log(`[reload] Sent reload to ${sent} connected extension(s)`);
  return sent;
}

async function sendReloadViaClient() {
  const { default: WebSocket } = await import('ws');
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on('open', () => {
      ws.send('trigger-reload');
      console.log('[reload] Sent reload signal via existing server');
      ws.close();
      resolve(true);
    });
    ws.on('error', () => {
      console.log('[reload] No reload server running — extensions will pick up changes on next page load');
      resolve(false);
    });
  });
}

// ─── Main ────────────────────────────────────────────

const wss = await createServer();

if (!reloadOnly) {
  for (const name of extensionNames) {
    const filter = EXTENSION_MAP[name];
    if (!filter) {
      console.error(`[build] Unknown extension: ${name}`);
      continue;
    }
    console.log(`\n[build] Building ${name}...`);
    try {
      execFileSync('pnpm', ['--filter', filter, 'build'], {
        cwd: ROOT,
        stdio: 'inherit',
      });
      console.log(`[build] Done: ${name}`);
    } catch {
      console.error(`[build] Failed: ${name}`);
      process.exit(1);
    }
  }
}

// Send reload signal
if (wss) {
  // We own the server — wait for extensions to connect if none are connected
  if (wss.clients.size === 0) {
    console.log('[reload] Waiting 3s for extension(s) to connect...');
    await new Promise((r) => setTimeout(r, 3000));
  }
  sendReloadViaServer(wss);
  // Give time for message delivery
  await new Promise((r) => setTimeout(r, 500));
  wss.close();
} else {
  // Another server is running — send via client connection
  await sendReloadViaClient();
}

process.exit(0);
