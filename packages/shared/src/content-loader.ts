/**
 * Opalite Content Loader — runs in ISOLATED world
 *
 * Replaces the minified content.js IIFE. Responsibilities:
 * 1. Inject compat.js + main.js into the page via <script> tags
 * 2. Load style.css into a hidden div for main.js to read
 * 3. Set up the postMessage bridge between page scripts and background
 * 4. Handle fetchAsDataUri requests (direct fetch with credentials,
 *    falling back to background service worker)
 *
 * Usage (in a WXT content script, ISOLATED world):
 *   import { setupContentLoader } from '@opalite/shared/content-loader';
 *   setupContentLoader({ appName: 'AutoGPT', xorKey: 'gpt' });
 */

import type { ContentLoaderConfig } from './types';

function isContextValid(): boolean {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

function injectScript(url: string): void {
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', url);
  document.documentElement.appendChild(script);
}

/**
 * Set up the postMessage bridge that connects page scripts (MAIN world)
 * to the background service worker and content script capabilities.
 *
 * Accepts messages from both `appName` (used by socket.ts) and `sourceId`
 * (used by main.js and background.ts) to handle all message paths.
 */
function setupMessageBridge(appName: string, sourceId: string): void {
  function isAcceptedSource(source: string | undefined): boolean {
    if (!source) return false;
    const lower = source.toLowerCase();
    return lower === appName.toLowerCase() || lower === sourceId.toLowerCase();
  }

  window.addEventListener('message', async (event: MessageEvent) => {
    const data = event.data;
    if (!isAcceptedSource(data?.source)) return;

    if (data?.to === 'background') {
      try {
        if (!isContextValid()) return;
        chrome.runtime.sendMessage(data, (response) => {
          try {
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError);
            }
          } catch { /* context invalidated */ }
          if (response?.to === 'page') {
            window.postMessage(response, '*');
          }
        });
      } catch { /* context invalidated */ }
    } else if (data?.to === 'content') {
      if (data.type === 'fetchAsDataUri') {
        await handleFetchAsDataUri(data, appName);
      }
    }
  });

  // Forward messages from background to page
  try {
    if (isContextValid()) {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        try {
          if (message?.to === 'page') {
            window.postMessage(message, '*');
          }
        } catch { /* ignore */ }
        if (sendResponse) {
          try {
            sendResponse();
          } catch { /* ignore */ }
        }
      });
    }
  } catch { /* context invalidated */ }
}

/**
 * Handle fetchAsDataUri: try direct fetch first (content script has
 * host_permissions), fall back to background service worker.
 */
async function handleFetchAsDataUri(
  data: Record<string, unknown>,
  appName: string
): Promise<void> {
  const id = data.id as string;
  const url = data.url as string;
  const type = data.type as string;

  try {
    // Omit credentials — ISOLATED world has no relevant cookies for
    // third-party CDNs, and credentials: 'include' defeats the CORS
    // bypass that host_permissions provides in MV3.
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const reader = new FileReader();
    reader.onloadend = () => {
      console.log('[Opalite Content] Direct fetch succeeded for:', url.substring(0, 80));
      window.postMessage(
        {
          source: appName,
          to: 'page',
          from: 'content',
          type: type + ':' + id,
          dataUri: reader.result,
        },
        '*'
      );
    };
    reader.readAsDataURL(blob);
  } catch (fetchErr) {
    console.warn(
      '[Opalite Content] Direct fetch failed (' +
        (fetchErr as Error).message +
        '), trying background worker...'
    );
    try {
      if (!isContextValid()) throw new Error('Extension context invalid');
      chrome.runtime.sendMessage(
        {
          source: 'Opalite',
          to: 'background',
          type: 'fetchAsDataUri',
          id,
          url,
          from: 'content',
        },
        (bgResp) => {
          try {
            if (chrome.runtime.lastError) {
              console.error(
                '[Opalite Content] BG fetch error:',
                chrome.runtime.lastError.message
              );
              window.postMessage(
                {
                  source: appName,
                  to: 'page',
                  from: 'content',
                  type: type + ':' + id,
                  error: 'BG: ' + chrome.runtime.lastError.message,
                },
                '*'
              );
              return;
            }
            if (bgResp?.dataUri) {
              console.log(
                '[Opalite Content] BG fetch succeeded:',
                Math.round(bgResp.dataUri.length / 1024) + 'KB'
              );
              window.postMessage(
                {
                  source: appName,
                  to: 'page',
                  from: 'content',
                  type: type + ':' + id,
                  dataUri: bgResp.dataUri,
                },
                '*'
              );
            } else if (bgResp?.error) {
              console.error('[Opalite Content] BG fetch failed:', bgResp.error);
              window.postMessage(
                {
                  source: appName,
                  to: 'page',
                  from: 'content',
                  type: type + ':' + id,
                  error: 'BG: ' + bgResp.error,
                },
                '*'
              );
            } else {
              window.postMessage(
                {
                  source: appName,
                  to: 'page',
                  from: 'content',
                  type: type + ':' + id,
                  error: 'BG: No response',
                },
                '*'
              );
            }
          } catch {
            window.postMessage(
              {
                source: appName,
                to: 'page',
                from: 'content',
                type: type + ':' + id,
                error: 'BG callback error',
              },
              '*'
            );
          }
        }
      );
    } catch (bgErr) {
      window.postMessage(
        {
          source: appName,
          to: 'page',
          from: 'content',
          type: type + ':' + id,
          error:
            (fetchErr as Error).message +
            ' (BG fallback: ' +
            (bgErr as Error).message +
            ')',
        },
        '*'
      );
    }
  }
}

/**
 * Initialize the content loader: inject static scripts, load CSS,
 * and set up the message bridge.
 *
 * Call from an ISOLATED-world content script that runs at document_start.
 */
export function setupContentLoader(config: ContentLoaderConfig): void {
  const { appName, sourceId, shouldSkip } = config;

  // Allow platform-specific skip logic (e.g., certain sub-pages)
  if (shouldSkip?.()) return;

  const compatUrl = chrome.runtime.getURL('scripts/compat.js');
  const mainUrl = chrome.runtime.getURL('scripts/main.js');
  const styleUrl = chrome.runtime.getURL('scripts/style.css');

  // Load style.css into a hidden div (main.js reads it from there)
  fetch(styleUrl)
    .then((resp) => resp.text())
    .then((css) => {
      const cssEl = document.createElement('div');
      cssEl.id = '__opalite-css';
      cssEl.style.display = 'none';
      cssEl.setAttribute('data-url', styleUrl);
      cssEl.textContent = css;
      document.documentElement.appendChild(cssEl);
      injectScript(compatUrl);
      injectScript(mainUrl);
      setupMessageBridge(appName, sourceId);
    })
    .catch(() => {
      // Even if CSS fetch fails, still inject scripts
      const cssEl = document.createElement('div');
      cssEl.id = '__opalite-css';
      cssEl.style.display = 'none';
      cssEl.setAttribute('data-url', styleUrl);
      document.documentElement.appendChild(cssEl);
      injectScript(compatUrl);
      injectScript(mainUrl);
      setupMessageBridge(appName, sourceId);
    });
}
