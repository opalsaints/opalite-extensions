/**
 * Opalite Storage Bridge — runs in ISOLATED world (content script)
 *
 * Listens for postMessage requests from auth.ts (MAIN world) and relays
 * chrome.storage.local operations, since page scripts cannot access
 * Chrome extension APIs.
 *
 * Also handles extension resource URL resolution requests from socket.ts.
 *
 * Usage (in a WXT content script, default ISOLATED world):
 *   import { setupStorageBridge } from '@opalite/shared/inject';
 *   setupStorageBridge();
 */

const ALLOWED_KEYS = ['opalite_jwt', 'opalite_user', 'opalite_refresh_token'] as const;

let contextValid = true;

function isContextValid(): boolean {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

function sendError(id: number, errorMsg: string): void {
  window.postMessage(
    {
      source: 'opalite-inject',
      type: 'OPALITE_STORAGE_RESPONSE',
      id,
      result: null,
      error: errorMsg,
    },
    window.location.origin
  );
}

function isAllowedKey(key: string): boolean {
  return (ALLOWED_KEYS as readonly string[]).includes(key);
}

/**
 * Initialize the storage bridge. Call once from an ISOLATED-world content script.
 */
export function setupStorageBridge(): void {
  // Handle storage requests from opalite-auth.js (MAIN world)
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'opalite-auth') return;
    if (event.data.type !== 'OPALITE_STORAGE') return;

    const { id, action, data } = event.data;

    if (!isContextValid()) {
      contextValid = false;
      sendError(id, 'extension_context_invalidated');
      return;
    }

    // Security: reject unlisted storage keys
    if (action === 'get' || action === 'set') {
      if (!data.key || !isAllowedKey(data.key)) {
        sendError(id, 'storage_key_not_allowed');
        return;
      }
    } else if (action === 'remove') {
      const keys: string[] = data.keys || [];
      for (const k of keys) {
        if (!isAllowedKey(k)) {
          sendError(id, 'storage_key_not_allowed');
          return;
        }
      }
    }

    try {
      if (action === 'get') {
        chrome.storage.local.get([data.key], (result) => {
          if (chrome.runtime.lastError) {
            sendError(id, chrome.runtime.lastError.message!);
            return;
          }
          window.postMessage(
            {
              source: 'opalite-inject',
              type: 'OPALITE_STORAGE_RESPONSE',
              id,
              result: result[data.key] || null,
            },
            window.location.origin
          );
        });
      } else if (action === 'set') {
        chrome.storage.local.set({ [data.key]: data.value }, () => {
          if (chrome.runtime.lastError) {
            sendError(id, chrome.runtime.lastError.message!);
            return;
          }
          window.postMessage(
            {
              source: 'opalite-inject',
              type: 'OPALITE_STORAGE_RESPONSE',
              id,
              result: true,
            },
            window.location.origin
          );
        });
      } else if (action === 'remove') {
        chrome.storage.local.remove(data.keys, () => {
          if (chrome.runtime.lastError) {
            sendError(id, chrome.runtime.lastError.message!);
            return;
          }
          window.postMessage(
            {
              source: 'opalite-inject',
              type: 'OPALITE_STORAGE_RESPONSE',
              id,
              result: true,
            },
            window.location.origin
          );
        });
      } else if (action === 'signout') {
        chrome.storage.local.remove(
          ['opalite_jwt', 'opalite_user', 'opalite_refresh_token'],
          () => {
            if (chrome.runtime.lastError) {
              sendError(id, chrome.runtime.lastError.message!);
              return;
            }
            chrome.runtime.sendMessage(
              { source: 'opalite', to: 'background', type: 'signOut' },
              () => {
                window.postMessage(
                  {
                    source: 'opalite-inject',
                    type: 'OPALITE_STORAGE_RESPONSE',
                    id,
                    result: true,
                  },
                  window.location.origin
                );
              }
            );
          }
        );
      }
    } catch {
      contextValid = false;
      sendError(id, 'extension_context_invalidated');
    }
  });

  // Handle resource URL requests from opalite-socket.js (MAIN world)
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'opalite-socket') return;
    if (event.data.type !== 'OPALITE_RESOURCE_URL') return;

    const { id, path } = event.data;

    if (!isContextValid()) return; // Silent fail — socket.ts has a 2s fallback

    try {
      const url = chrome.runtime.getURL(path);
      window.postMessage(
        {
          source: 'opalite-inject',
          type: 'OPALITE_RESOURCE_URL_RESPONSE',
          id,
          url,
        },
        window.location.origin
      );
    } catch {
      contextValid = false;
      // Silent fail — socket.ts has a 2s fallback
    }
  });
}
