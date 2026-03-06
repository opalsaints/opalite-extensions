# Opalite Extensions — Development Guide

## Project Structure

Monorepo with WXT-based Chrome extensions for AI image platforms.

```
apps/
  gemini/          # Gemini extension (@opalite/gemini-extension)
  chatgpt/         # ChatGPT extension (@opalite/chatgpt-extension)
  grok/            # Grok extension (@opalite/grok-extension)
  deviantart/      # DeviantArt extension (@opalite/deviantart-extension)
packages/
  shared/          # Shared code: socket.ts, background.ts, content-loader.ts, dev-reload.ts
scripts/
  dev-build.mjs    # Build + hot-reload script
  reload-server.mjs # WebSocket reload server
extensions/        # Legacy pre-WXT extensions (reference only)
```

## Critical: Extension Reload Workflow

**NEVER try to interact with `chrome://extensions` through browser automation tools.**
Chrome restricts all script execution on `chrome://` pages. Browser MCP tools cannot screenshot, click, or execute JS on these pages.

**Instead, use the terminal-based hot-reload system:**

### Step 1: Start the reload server (once, keep running)
```bash
pnpm reload-server
# Starts WebSocket server on ws://localhost:8976
# Extensions auto-connect to this server via dev-reload.ts in background.ts
```

### Step 2: Build + reload an extension
```bash
pnpm dev-build:gemini    # Build gemini + send reload signal
pnpm dev-build:chatgpt   # Build chatgpt + send reload signal
pnpm dev-build:grok      # Build grok + send reload signal
pnpm dev-build:all       # Build all + send reload signal
```

### Step 3: Reload without rebuilding (if already built)
```bash
pnpm reload              # Just send reload signal to all connected extensions
```

### How it works
1. `reload-server.mjs` runs a WebSocket server on port 8976
2. Each extension's background.ts includes `setupDevReload()` from `packages/shared/src/dev-reload.ts`
3. The dev-reload client connects to ws://localhost:8976 and listens for "reload" messages
4. On "reload", it calls `chrome.runtime.reload()` and then refreshes matching tabs
5. `dev-build.mjs` builds via pnpm, then sends "trigger-reload" to the server, which relays to extensions

### Check if reload server is running
```bash
lsof -i :8976
```

## Build Commands

```bash
pnpm build               # Build all extensions
pnpm build:gemini        # Build just gemini
pnpm build:chatgpt       # Build just chatgpt
pnpm build:grok          # Build just grok
pnpm build:deviantart    # Build just deviantart
```

Build output goes to `apps/<name>/.output/chrome-mv3/`.

## Architecture: Download Pipeline

### Two download paths controlled by `Pb` flag in main.js

- **`Pb = true`** (cloud sync): `UX()` → posts `window.postMessage({source:"Opalite", type:"downloadImage"})` → Opalite socket interceptor in `socket.ts` catches it → fetches image as data URI → `socket.emit('download')` to opalitestudios.com
- **`Pb = false`** (local only): `jb("downloadImage", "background")` → background worker downloads locally

### What controls `Pb`
```
Pb = isDownloaderConnected && isMember
```
- `isDownloaderConnected`: Set by `Mnt()` hook — checks `Ii.connected` (panel's localhost socket) OR `window.__opaliteSocket.isConnected()` (Opalite socket). Polled every 2 seconds.
- `isMember`: Set by `socket.ts` `planStatus` handler: `data.plan !== 'free'`. Only paid plans (starter/plus/pro) get cloud sync.

### Auto-download guard in main.js (line ~209255)
```javascript
if (!Vt && !ie.current) return; // Vt = isDiscord, ie.current = isMember
```
Non-Discord platforms require `isMember = true` for auto-download to fire.

### Image fetch chain (content-loader.ts)
1. Content script `fetch(url, {credentials:'include'})` — needs host_permissions
2. Background worker fetch — fallback
3. Raw URL fallback — server tries to fetch, but fails for authenticated URLs

### host_permissions needed per extension
- Gemini: `lh3.googleusercontent.com` (generated images hosted here)
- ChatGPT: Check `oaidalleapiprodus.blob.core.windows.net` or similar
- Grok: Check where X/Grok hosts generated images

## Key Files

| File | Purpose |
|------|---------|
| `packages/shared/src/socket.ts` | Opalite WebSocket connection, download interceptor, plan status |
| `packages/shared/src/background.ts` | Background service worker, message routing, dev-reload setup |
| `packages/shared/src/content-loader.ts` | postMessage bridge (ISOLATED world), image fetch pipeline |
| `apps/*/wxt.config.ts` | WXT config with manifest (permissions, content scripts) |
| `apps/*/public/scripts/main.js` | Static 7.5MB panel UI artifact (DO NOT EDIT — it's a build artifact) |

## Common Issues

### "isMember is false" / auto-download not triggering
- Check `socket.ts` `planStatus` handler — `isMember = data.plan !== 'free'` (only paid plans)
- Verify with: `window.useOpaliteGlobal.getState()` — check `isMember`, `userPlan`, `isDownloaderConnected`
- If `userPlan` is undefined/null, the socket didn't receive planStatus — check auth + socket connection
- Server always fetches fresh plan from DB during socket auth, so JWT plan claims may be stale

### Image fetch fails ("Direct fetch failed", "BG fetch failed")
- Missing host_permissions for the image CDN domain
- Check `wxt.config.ts` `host_permissions` array
- Console will show: `[Opalite Content] Direct fetch failed`

### Extension not reloading
- Verify reload server is running: `lsof -i :8976`
- Check extension connected: server logs show client count
- Make sure extension was loaded from the correct `.output/chrome-mv3` directory

## Auth Pipeline (Extension → Server → Database)

### Extension-side auth flow
1. User clicks "Sign in" in popup → opens `opalitestudios.com/api/extension/auth?type=<extensionType>`
2. Server generates 5-min auth code, redirects to callback page
3. `callback.ts` (05-callback.content.ts) extracts code, POSTs it back to same endpoint
4. Server exchanges code for JWT (7-day expiry) + refresh token (30-day expiry)
5. `callback.ts` stores JWT/user/refresh in `chrome.storage.local`
6. Back on the AI platform page, `auth.ts` (01-auth) creates `window.__opalite` API using postMessage bridge to `inject.ts` (02-inject) for storage access
7. `socket.ts` (03-socket) calls `waitForToken()` which polls `__opalite.getToken()` for up to 30s
8. Socket connects with JWT in auth handshake

### Server-side socket auth
- Socket middleware verifies JWT, then **always fetches fresh plan from database** (NOT from JWT claims)
- Server emits `planStatus` with plan, limits, credits, usage, storage after handshake
- Extension's socket.ts updates Zustand store: `isMember = data.plan !== 'free'`

### JWT refresh
- `auth.ts` `getValidToken()` checks JWT expiry with 1-hour buffer
- If near expiry, calls `/api/extension/refresh` with refresh token
- Server returns new JWT with **fresh plan from database**

### Content script injection order (critical)
```
01-auth.content.ts      → MAIN world: creates window.__opalite auth API
02-inject.content.ts    → ISOLATED world: chrome.storage.local bridge
03-socket.content.ts    → MAIN world: socket.io connection + download interceptor
04-main.content.ts      → ISOLATED world: injects compat.js + main.js <script> tags
05-callback.content.ts  → Runs on opalitestudios.com/api/extension/auth* only
```

## Server-Side Code (opalite repo)

Server code lives at: `~/Desktop/OpalClaude/opalite/apps/server/src/`

| File | Purpose |
|------|---------|
| `socket/middleware/auth.ts` | JWT verification + `getUserPlan()` from DB |
| `socket/handlers/connection.ts` | Handshake, planStatus emission, broadcast helper |
| `socket/server.ts` | Socket.io server setup, exports `getIO()` |
| `app/api/extension/auth/route.ts` | Auth code exchange → JWT + refresh token |
| `app/api/extension/refresh/route.ts` | JWT refresh with fresh plan from DB |
| `app/api/stripe/webhook/route.ts` | Stripe webhook → DB update + socket broadcast |
| `lib/usage.ts` | `getUserPlan()` helper |
| `lib/db/schema.ts` | User table: `plan` enum = `free|starter|plus|pro` |

### Stripe webhook → real-time plan broadcast
After Stripe events (checkout, subscription update/cancel), the server:
1. Updates the user's plan in the database
2. Calls `broadcastPlanStatusToUser(userId)` which:
   - Fetches fresh plan from DB
   - Builds full planStatus payload (limits, credits, usage, storage)
   - Emits to `user:${userId}` room so all connected extensions update immediately
3. Sends plan change email

## Known Issues

### Image detection broken on current Gemini UI
- main.js v1.2.0 "Gemini Suite" shows **Count: 0** — no images detected
- The Opalite shadow DOM + UI panel loads correctly, but the image scanner doesn't match Gemini's current DOM structure for generated images
- This is NOT a WXT migration bug — it's a pre-existing compatibility issue with the main.js static artifact
- Gemini generated images use `lh3.googleusercontent.com` URLs
- Clicking Gemini's native download button triggers local download only, bypassing cloud sync

### Extension context invalidation after reload
- After `pnpm dev-build:*`, content scripts in already-open tabs lose their `chrome.runtime` context
- Console shows: `[Opalite] Extension context invalidated — reload the page to restore connection`
- **Fix**: Refresh the page after extension reload to re-inject all content scripts

### Dashboard "Reconnecting..." status
- The Opalite dashboard at opalitestudios.com/app may show "Reconnecting..." when its socket drops
- This is independent of extension socket connections

## Do NOT
- Edit `apps/*/public/scripts/main.js` directly (it's a static build artifact from the panel)
- Try to use browser automation to interact with `chrome://extensions` pages
- Change `isMember` logic in socket.ts without understanding the full Pb download path
