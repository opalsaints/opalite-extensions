/**
 * Opalite Auth Callback — runs on opalitestudios.com/api/extension/auth
 *
 * Captures the auth code from the JSON response, exchanges it for JWT,
 * and stores the JWT in chrome.storage.local.
 *
 * Usage (in a WXT content script matching opalitestudios.com):
 *   import { setupAuthCallback } from '@opalite/shared/callback';
 *   setupAuthCallback({
 *     extensionType: 'chatgpt',
 *     siteUrl: 'https://chatgpt.com',
 *     siteName: 'chatgpt.com',
 *     server: 'https://opalitestudios.com',
 *   });
 */

import type { CallbackConfig } from './types';

function tryExtractCode(): string | null {
  try {
    const text = document.body?.innerText;
    if (!text) return null;
    const data = JSON.parse(text.trim());
    return data.code || null;
  } catch {
    return null;
  }
}

function exchangeCodeForJwt(
  code: string,
  server: string,
  extensionType: string
): Promise<{ jwt?: string; user?: { name?: string }; refreshToken?: string }> {
  return fetch(server + '/api/extension/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, extensionType }),
  })
    .then((response) => {
      if (!response.ok) throw new Error('Exchange failed: ' + response.status);
      return response.json();
    })
    .then((data) => {
      const items: Record<string, unknown> = {};
      if (data.jwt) items['opalite_jwt'] = data.jwt;
      if (data.user) items['opalite_user'] = data.user;
      if (data.refreshToken) items['opalite_refresh_token'] = data.refreshToken;

      return new Promise<typeof data>((resolve) => {
        chrome.storage.local.set(items, () => {
          console.log('[Opalite] Auth complete — JWT stored. You can close this tab.');
          resolve(data);
        });
      });
    });
}

/**
 * Build the full-page status layout via DOM APIs (no innerHTML).
 * Returns the <p> element so callers can set content safely.
 */
function createStatusLayout(isError: boolean): HTMLParagraphElement {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }

  const outer = document.createElement('div');
  outer.style.fontFamily = 'system-ui, sans-serif';
  outer.style.display = 'flex';
  outer.style.flexDirection = 'column';
  outer.style.alignItems = 'center';
  outer.style.justifyContent = 'center';
  outer.style.minHeight = '100vh';
  outer.style.background = '#0a0a0a';
  outer.style.color = '#e4e4e7';

  const inner = document.createElement('div');
  inner.style.textAlign = 'center';
  inner.style.maxWidth = '400px';
  inner.style.padding = '40px';

  const h1 = document.createElement('h1');
  h1.style.fontSize = '24px';
  h1.style.fontWeight = '700';
  h1.style.marginBottom = '12px';

  if (isError) {
    h1.style.color = '#ef4444';
    h1.textContent = 'Error';
  } else {
    h1.style.background = 'linear-gradient(to right, #8b5cf6, #a855f7)';
    h1.style.webkitBackgroundClip = 'text';
    h1.style.webkitTextFillColor = 'transparent';
    h1.textContent = 'Opalite';
  }

  const p = document.createElement('p');
  p.style.color = '#a1a1aa';
  p.style.fontSize = '14px';
  p.style.lineHeight = '1.6';

  inner.appendChild(h1);
  inner.appendChild(p);
  outer.appendChild(inner);
  document.body.appendChild(outer);

  return p;
}

function showConnecting(): void {
  const p = createStatusLayout(false);
  p.textContent = 'Connecting your account\u2026';
}

function showSuccess(name: string, siteUrl: string, siteName: string): void {
  const p = createStatusLayout(false);

  p.appendChild(document.createTextNode('Welcome, '));
  const strong = document.createElement('strong');
  strong.textContent = name;
  p.appendChild(strong);
  p.appendChild(document.createTextNode('! Your extension is now connected.'));

  p.appendChild(document.createElement('br'));
  p.appendChild(document.createElement('br'));

  p.appendChild(document.createTextNode('Go to '));
  const link = document.createElement('a');
  link.href = siteUrl;
  link.style.color = '#a78bfa';
  link.textContent = siteName;
  p.appendChild(link);
  p.appendChild(
    document.createTextNode(" and start generating images \u2014 they'll be saved automatically.")
  );

  p.appendChild(document.createElement('br'));
  p.appendChild(document.createElement('br'));

  const hint = document.createElement('span');
  hint.style.fontSize = '12px';
  hint.style.color = '#71717a';
  hint.textContent = 'You can close this tab.';
  p.appendChild(hint);
}

function showError(errMessage: string): void {
  const p = createStatusLayout(true);

  p.appendChild(
    document.createTextNode('Failed to connect. Please try again from the extension popup.')
  );

  p.appendChild(document.createElement('br'));
  p.appendChild(document.createElement('br'));

  const detail = document.createElement('span');
  detail.style.fontSize = '12px';
  detail.style.color = '#71717a';
  detail.textContent = errMessage;
  p.appendChild(detail);
}

/**
 * Initialize the auth callback handler.
 * Only runs on the /api/extension/auth page for the matching extension type.
 */
export function setupAuthCallback(config: CallbackConfig): void {
  const { extensionType, siteUrl, siteName, server } = config;

  // Only run on the auth endpoint AND only for this extension's type
  if (!location.href.includes('/api/extension/auth')) return;
  const urlType = new URLSearchParams(location.search).get('type');
  if (urlType && urlType !== extensionType) return;

  function processCode(code: string): void {
    showConnecting();
    exchangeCodeForJwt(code, server, extensionType)
      .then((data) => {
        const name = data.user?.name || 'there';
        showSuccess(name, siteUrl, siteName);
      })
      .catch((err: Error) => {
        console.error('[Opalite] Auth exchange failed:', err);
        showError(err.message);
      });
  }

  function run(): void {
    const code = tryExtractCode();
    if (!code) {
      // Page might still be loading — wait and retry
      setTimeout(() => {
        const code2 = tryExtractCode();
        if (!code2) return; // Not an auth code page, do nothing
        processCode(code2);
      }, 500);
      return;
    }
    processCode(code);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}
