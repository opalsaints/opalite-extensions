/**
 * Opalite Auth Callback — runs on opalitestudios.com/api/extension/auth
 * Captures the auth code from the JSON response, exchanges it for JWT,
 * and stores the JWT in chrome.storage.local.
 */
(function () {
  var SERVER = 'https://opalitestudios.com';
  var EXTENSION_TYPE = 'grok';
  var SITE_URL = 'https://grok.com';
  var SITE_NAME = 'grok.com';

  // Only run on the auth endpoint AND only for this extension's type
  if (!location.href.includes('/api/extension/auth')) return;
  var urlType = new URLSearchParams(location.search).get('type');
  if (urlType && urlType !== EXTENSION_TYPE) return;

  // Try to read the auth code from the page body (server returns JSON { code: "..." })
  function tryExtractCode() {
    try {
      var text = document.body && document.body.innerText;
      if (!text) return null;
      var data = JSON.parse(text.trim());
      return data.code || null;
    } catch (e) {
      return null;
    }
  }

  function exchangeCodeForJwt(code) {
    return fetch(SERVER + '/api/extension/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, extensionType: EXTENSION_TYPE }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Exchange failed: ' + response.status);
        return response.json();
      })
      .then(function (data) {
        var items = {};
        if (data.jwt) items['opalite_jwt'] = data.jwt;
        if (data.user) items['opalite_user'] = data.user;
        if (data.refreshToken) items['opalite_refresh_token'] = data.refreshToken;

        return new Promise(function (resolve) {
          chrome.storage.local.set(items, function () {
            console.log('[Opalite] Auth complete — JWT stored. You can close this tab.');
            resolve(data);
          });
        });
      });
  }

  /**
   * Build the full-page status layout via DOM APIs (no innerHTML).
   * Returns the <p> element so callers can populate content safely.
   */
  function createStatusLayout(isError) {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }

    var outer = document.createElement('div');
    outer.style.fontFamily = 'system-ui, sans-serif';
    outer.style.display = 'flex';
    outer.style.flexDirection = 'column';
    outer.style.alignItems = 'center';
    outer.style.justifyContent = 'center';
    outer.style.minHeight = '100vh';
    outer.style.background = '#0a0a0a';
    outer.style.color = '#e4e4e7';

    var inner = document.createElement('div');
    inner.style.textAlign = 'center';
    inner.style.maxWidth = '400px';
    inner.style.padding = '40px';

    var h1 = document.createElement('h1');
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

    var p = document.createElement('p');
    p.style.color = '#a1a1aa';
    p.style.fontSize = '14px';
    p.style.lineHeight = '1.6';

    inner.appendChild(h1);
    inner.appendChild(p);
    outer.appendChild(inner);
    document.body.appendChild(outer);

    return p;
  }

  function showConnecting() {
    var p = createStatusLayout(false);
    p.textContent = 'Connecting your account\u2026';
  }

  function showSuccess(name) {
    var p = createStatusLayout(false);

    p.appendChild(document.createTextNode('Welcome, '));
    var strong = document.createElement('strong');
    strong.textContent = name; // textContent auto-escapes
    p.appendChild(strong);
    p.appendChild(document.createTextNode('! Your extension is now connected.'));

    p.appendChild(document.createElement('br'));
    p.appendChild(document.createElement('br'));

    p.appendChild(document.createTextNode('Go to '));
    var link = document.createElement('a');
    link.href = SITE_URL;
    link.style.color = '#a78bfa';
    link.textContent = SITE_NAME;
    p.appendChild(link);
    p.appendChild(
      document.createTextNode(
        " and start generating images \u2014 they'll be saved automatically."
      )
    );

    p.appendChild(document.createElement('br'));
    p.appendChild(document.createElement('br'));

    var hint = document.createElement('span');
    hint.style.fontSize = '12px';
    hint.style.color = '#71717a';
    hint.textContent = 'You can close this tab.';
    p.appendChild(hint);
  }

  function showError(errMessage) {
    var p = createStatusLayout(true);

    p.appendChild(
      document.createTextNode(
        'Failed to connect. Please try again from the extension popup.'
      )
    );

    p.appendChild(document.createElement('br'));
    p.appendChild(document.createElement('br'));

    var detail = document.createElement('span');
    detail.style.fontSize = '12px';
    detail.style.color = '#71717a';
    detail.textContent = errMessage; // textContent auto-escapes
    p.appendChild(detail);
  }

  function run() {
    var code = tryExtractCode();
    if (!code) {
      // Page might still be loading — wait and retry
      setTimeout(function () {
        var code2 = tryExtractCode();
        if (!code2) return; // Not an auth code page, do nothing
        processCode(code2);
      }, 500);
      return;
    }
    processCode(code);
  }

  function processCode(code) {
    showConnecting();
    exchangeCodeForJwt(code)
      .then(function (data) {
        var name = (data.user && data.user.name) || 'there';
        showSuccess(name);
      })
      .catch(function (err) {
        console.error('[Opalite] Auth exchange failed:', err);
        showError(err.message);
      });
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
