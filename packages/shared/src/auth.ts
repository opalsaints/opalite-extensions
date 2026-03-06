/**
 * Opalite Auth Helper — runs in MAIN world (page context)
 *
 * Sets up window.__opalite which main.js uses for Socket.io auth.
 * Uses postMessage to communicate with the ISOLATED world storage bridge
 * (inject.ts) for chrome.storage.local access.
 *
 * Usage (in a WXT content script with world: 'MAIN'):
 *   import { setupOpaliteAuth } from '@opalite/shared/auth';
 *   setupOpaliteAuth('https://opalitestudios.com');
 */

import type { OpaliteAuthAPI, OpaliteUser, AuthExchangeResult } from './types';

const pendingRequests: Record<number, (value: unknown) => void> = {};
let requestId = 0;

function storageRequest(action: string, data: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    const id = ++requestId;
    pendingRequests[id] = resolve;
    window.postMessage(
      {
        source: 'opalite-auth',
        type: 'OPALITE_STORAGE',
        id,
        action,
        data,
      },
      window.location.origin
    );
    // Timeout: resolve null after 5s if bridge doesn't respond
    setTimeout(() => {
      if (pendingRequests[id]) {
        delete pendingRequests[id];
        resolve(null);
      }
    }, 5000);
  });
}

function setupStorageResponseListener(): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'opalite-inject') return;
    if (event.data.type !== 'OPALITE_STORAGE_RESPONSE') return;

    const id: number = event.data.id;
    const resolve = pendingRequests[id];
    if (resolve) {
      delete pendingRequests[id];
      if (event.data.error === 'extension_context_invalidated') {
        console.warn(
          '[Opalite] Extension context invalidated — reload the page to restore connection'
        );
        resolve(null);
      } else {
        resolve(event.data.result);
      }
    }
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string, withinSeconds = 3600): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp - now < withinSeconds;
}

/**
 * Initialize the Opalite auth helper on window.__opalite.
 * Call this once from a MAIN-world content script at document_start.
 */
export function setupOpaliteAuth(server: string): OpaliteAuthAPI {
  setupStorageResponseListener();

  const api: OpaliteAuthAPI = {
    server,

    getToken(): Promise<string | null> {
      return (storageRequest('get', { key: 'opalite_jwt' }) as Promise<string | null>).then(
        (token) => {
          if (token) return token;
          // Retry once after 500ms — handles timing race where the storage
          // bridge (inject.ts) hasn't registered its listener yet
          return new Promise<string | null>((resolve) => {
            setTimeout(() => {
              (storageRequest('get', { key: 'opalite_jwt' }) as Promise<string | null>).then(
                resolve
              );
            }, 500);
          });
        }
      );
    },

    setToken(token: string) {
      return storageRequest('set', { key: 'opalite_jwt', value: token });
    },

    getRefreshToken(): Promise<string | null> {
      return storageRequest('get', { key: 'opalite_refresh_token' }) as Promise<string | null>;
    },

    setRefreshToken(token: string) {
      return storageRequest('set', { key: 'opalite_refresh_token', value: token });
    },

    getUser(): Promise<OpaliteUser | null> {
      return storageRequest('get', { key: 'opalite_user' }) as Promise<OpaliteUser | null>;
    },

    setUser(user: OpaliteUser) {
      return storageRequest('set', { key: 'opalite_user', value: user });
    },

    clearAuth() {
      return storageRequest('remove', {
        keys: ['opalite_jwt', 'opalite_user', 'opalite_refresh_token'],
      });
    },

    signOut() {
      return storageRequest('signout', {});
    },

    exchangeCode(code: string, extensionType: string): Promise<AuthExchangeResult> {
      return fetch(server + '/api/extension/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, extensionType }),
      })
        .then((response) => {
          if (!response.ok) throw new Error('Failed to exchange auth code');
          return response.json();
        })
        .then((data: AuthExchangeResult) => {
          return api
            .setToken(data.jwt)
            .then(() => api.setUser(data.user))
            .then(() => {
              if (data.refreshToken) return api.setRefreshToken(data.refreshToken);
            })
            .then(() => data);
        });
    },

    refreshAuth(): Promise<boolean> {
      return Promise.all([api.getRefreshToken(), api.getToken()]).then(
        ([refreshToken, currentJwt]) => {
          if (!refreshToken) return false;
          // H10 fix: 10-second timeout prevents hanging if server is down
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          return fetch(server + '/api/extension/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken, currentJwt: currentJwt || '' }),
            signal: controller.signal,
          })
            .then((response) => {
              clearTimeout(timeoutId);
              if (!response.ok) {
                if (response.status === 401) {
                  return api.clearAuth().then(() => false);
                }
                return false;
              }
              return response.json().then((data: { jwt: string; user: OpaliteUser }) => {
                return api
                  .setToken(data.jwt)
                  .then(() => api.setUser(data.user))
                  .then(() => true);
              });
            })
            .catch((err) => {
              console.error('[Opalite] Failed to refresh auth:', err);
              return false;
            });
        }
      );
    },

    getValidToken(): Promise<string | null> {
      return api.getToken().then((token) => {
        if (!token) return null;
        if (isTokenExpiringSoon(token, 3600)) {
          return api.refreshAuth().then((refreshed) => {
            if (refreshed) return api.getToken();
            // C2 fix: return null instead of expired token
            console.warn('[Opalite] Token expired and refresh failed — auth invalid');
            return null;
          });
        }
        return token;
      });
    },

    isAuthenticated(): Promise<boolean> {
      return api.getToken().then((token) => !!token);
    },
  };

  window.__opalite = api;
  console.log('[Opalite] Auth helper loaded in page context (MAIN world)');
  return api;
}
