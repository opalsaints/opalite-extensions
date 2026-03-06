/**
 * Opalite Background Service Worker
 *
 * Handles downloads, notifications, fetch-as-data-URI, sign out,
 * and session cookie sync with opalitestudios.com.
 *
 * Usage (in a WXT background entrypoint):
 *   import { setupBackground } from '@opalite/shared/background';
 *   export default defineBackground(() => {
 *     setupBackground({
 *       extensionType: 'chatgpt',
 *       server: 'https://opalitestudios.com',
 *       allowedFetchDomains: ['chatgpt.com', 'openai.com', '...'],
 *       sourceId: 'opalite',
 *     });
 *   });
 */

import type { BackgroundConfig } from './types';

const SYNC_COOKIE_NAME = 'sb-rhcptoaysfkuhuujvuaq-auth-token';

function getTextFilename(filename: string): string {
  const parts = filename.split('.');
  parts.pop();
  parts.push('txt');
  return parts.join('.');
}

function downloadFile(url: string, filename: string): Promise<void> {
  return chrome.downloads.download({ url, filename }).then(() => {
    console.log(`Download successful: ${filename}`);
  });
}

/**
 * Initialize the background service worker with platform-specific config.
 */
export function setupBackground(config: BackgroundConfig): void {
  const { extensionType, server, allowedFetchDomains, sourceId } = config;
  let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  chrome.runtime.onInstalled.addListener(() => {});
  chrome.storage.session.setAccessLevel(
    { accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' },
    () => {}
  );

  chrome.runtime.onMessage.addListener(
    (
      message: Record<string, unknown>,
      _sender: chrome.runtime.MessageSender,
      sendResponse?: (response?: unknown) => void
    ) => {
      const rawSource = (message?.source as string) || '';
      const source = rawSource.toLowerCase();
      if (!source || source !== sourceId || message?.to !== 'background') {
        sendResponse?.();
        return;
      }

      switch (message.type) {
        case 'downloadImage':
          downloadFile(message.url as string, message.filename as string).catch((err) => {
            console.error('[Opalite BG] Download failed:', (err as Error).message);
          });
          if (message.text) {
            downloadFile(
              message.text as string,
              getTextFilename(message.filename as string)
            ).catch((err) => {
              console.error('[Opalite BG] Text download failed:', (err as Error).message);
            });
          }
          break;

        case 'notification':
          chrome.notifications.create(
            '',
            {
              type: 'basic',
              iconUrl: 'images/icon-128.png',
              title: message.title as string,
              message: message.message as string,
            },
            (notificationId) => {
              sendResponse?.({
                source: rawSource,
                from: 'background',
                to: message.from,
                type: `${message.type}:${message.id}`,
                notificationId,
              });
            }
          );
          return true; // Keep channel open for async

        case 'fetchAsDataUri':
          (async () => {
            try {
              const url = message.url as string;
              if (!url || typeof url !== 'string') {
                throw new Error('Invalid URL');
              }
              const parsed = new URL(url);
              const isAllowed = allowedFetchDomains.some((domain) =>
                parsed.hostname.endsWith(domain)
              );
              if (!isAllowed) {
                throw new Error('URL not in allowed domains');
              }
              console.log('[Opalite BG] Fetching:', url.substring(0, 80));
              // Omit credentials — background worker has no relevant cookies
              // for third-party CDNs, and credentials triggers CORS in MV3.
              const resp = await fetch(url);
              if (!resp.ok) {
                throw new Error('HTTP ' + resp.status);
              }
              const blob = await resp.blob();
              const reader = new FileReader();
              const dataUri = await new Promise<string>((resolve, reject) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('FileReader failed'));
                reader.readAsDataURL(blob);
              });
              console.log(
                '[Opalite BG] Fetch succeeded:',
                Math.round(dataUri.length / 1024) + 'KB'
              );
              sendResponse?.({
                source: rawSource,
                from: 'background',
                to: message.from,
                type: `${message.type}:${message.id}`,
                dataUri,
              });
            } catch (fetchErr) {
              console.error('[Opalite BG] Fetch failed:', (fetchErr as Error).message);
              sendResponse?.({
                source: rawSource,
                from: 'background',
                to: message.from,
                type: `${message.type}:${message.id}`,
                error: (fetchErr as Error).message,
              });
            }
          })();
          return true; // Keep channel open for async

        case 'signOut':
          (async () => {
            try {
              if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
              const cookieNames = [SYNC_COOKIE_NAME];
              for (let i = 0; i < 5; i++) cookieNames.push(SYNC_COOKIE_NAME + '.' + i);
              for (const cn of cookieNames) {
                try {
                  await chrome.cookies.remove({
                    url: server,
                    name: cn,
                  });
                } catch { /* ignore */ }
              }
            } catch { /* ignore */ }
            chrome.storage.local.remove(
              ['opalite_jwt', 'opalite_user', 'opalite_refresh_token'],
              () => {
                console.log('[Opalite BG] Sign out complete — cookie + storage cleared');
                sendResponse?.({
                  source: rawSource,
                  from: 'background',
                  to: message.from,
                  type: message.type + ':done',
                  success: true,
                });
              }
            );
          })();
          return true; // Keep channel open for async

        default:
          sendResponse?.({
            source: rawSource,
            from: 'background',
            to: message.from,
            type: `${message.type}:${message.id}`,
          });
      }
    }
  );

  // ─── Session Cookie Sync ──────────────────────────────
  function isSupabaseCookie(name: string): boolean {
    return name === SYNC_COOKIE_NAME || name.startsWith(SYNC_COOKIE_NAME + '.');
  }

  chrome.cookies.onChanged.addListener((changeInfo) => {
    const cookie = changeInfo.cookie;
    if (!isSupabaseCookie(cookie.name)) return;
    if (!cookie.domain.endsWith('opalitestudios.com')) return;

    if (changeInfo.removed) {
      if (changeInfo.cause === 'overwrite') return;
      console.log('[Opalite BG] Session cookie removed — clearing extension auth');
      chrome.storage.local.remove(['opalite_jwt', 'opalite_user', 'opalite_refresh_token']);
      return;
    }

    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      assembleAndSyncSession();
    }, 1500);
  });

  function assembleAndSyncSession(): void {
    chrome.cookies.getAll({ domain: 'opalitestudios.com' }, (cookies) => {
      const baseCookie = cookies.find((c) => c.name === SYNC_COOKIE_NAME);
      if (baseCookie) {
        syncSessionFromCookie(baseCookie.value);
        return;
      }
      const chunks = cookies
        .filter((c) => c.name.startsWith(SYNC_COOKIE_NAME + '.'))
        .sort((a, b) => {
          const aNum = parseInt(a.name.split('.').pop()!, 10);
          const bNum = parseInt(b.name.split('.').pop()!, 10);
          return aNum - bNum;
        });
      if (chunks.length === 0) return;
      const assembled = chunks.map((c) => c.value).join('');
      syncSessionFromCookie(assembled);
    });
  }

  function syncSessionFromCookie(cookieValue: string): void {
    chrome.storage.local.get(['opalite_user'], (result) => {
      const currentUser = result.opalite_user;
      const currentUserId =
        currentUser &&
        (typeof currentUser === 'string' ? JSON.parse(currentUser) : currentUser).id;

      fetch(server + '/api/extension/session-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: cookieValue, extensionType }),
      })
        .then((resp) => {
          if (!resp.ok) {
            if (resp.status === 401) {
              chrome.storage.local.remove([
                'opalite_jwt',
                'opalite_user',
                'opalite_refresh_token',
              ]);
            }
            return null;
          }
          return resp.json();
        })
        .then((data) => {
          if (!data) return;
          const newUserId = data.user?.id;
          if (newUserId === currentUserId) {
            console.log('[Opalite BG] Session sync: same user, skipping');
            return;
          }
          console.log(
            '[Opalite BG] Account synced: ' + (currentUserId || 'none') + ' → ' + newUserId
          );
          const items: Record<string, unknown> = {};
          if (data.jwt) items.opalite_jwt = data.jwt;
          if (data.user) items.opalite_user = data.user;
          if (data.refreshToken) items.opalite_refresh_token = data.refreshToken;
          chrome.storage.local.set(items);
        })
        .catch((fetchErr: Error) => {
          console.error('[Opalite BG] Session sync failed:', fetchErr.message);
        });
    });
  }
}
