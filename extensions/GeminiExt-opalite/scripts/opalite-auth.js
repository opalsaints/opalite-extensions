/**
 * Opalite Auth Helper — runs in MAIN world (page context)
 * Declared with "world": "MAIN" in manifest.json so it executes
 * synchronously in the page context at document_start.
 *
 * Sets up window.__opalite which main.js uses for Socket.io auth.
 * Uses postMessage to communicate with opalite-inject.js (ISOLATED world)
 * for chrome.storage.local access.
 */
(function() {
  var OPALITE_SERVER = 'https://opalitestudios.com';
  var pendingRequests = {};
  var requestId = 0;

  function storageRequest(action, data) {
    return new Promise(function(resolve) {
      var id = ++requestId;
      pendingRequests[id] = resolve;
      window.postMessage({
        source: 'opalite-auth',
        type: 'OPALITE_STORAGE',
        id: id,
        action: action,
        data: data
      }, window.location.origin);
      setTimeout(function() {
        if (pendingRequests[id]) {
          delete pendingRequests[id];
          resolve(null);
        }
      }, 5000);
    });
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'opalite-inject') return;
    if (event.data.type !== 'OPALITE_STORAGE_RESPONSE') return;
    var id = event.data.id;
    var resolve = pendingRequests[id];
    if (resolve) {
      delete pendingRequests[id];
      if (event.data.error === 'extension_context_invalidated') {
        console.warn('[Opalite] Extension context invalidated — reload the page to restore connection');
        resolve(null);
      } else {
        resolve(event.data.result);
      }
    }
  });

  function decodeJwtPayload(token) {
    try {
      var payload = token.split('.')[1];
      return JSON.parse(atob(payload));
    } catch(e) {
      return null;
    }
  }

  function isTokenExpiringSoon(token, withinSeconds) {
    withinSeconds = withinSeconds || 3600;
    var payload = decodeJwtPayload(token);
    if (!payload || !payload.exp) return true;
    var now = Math.floor(Date.now() / 1000);
    return payload.exp - now < withinSeconds;
  }

  window.__opalite = {
    server: OPALITE_SERVER,

    getToken: function() {
      return storageRequest('get', { key: 'opalite_jwt' }).then(function(token) {
        if (token) return token;
        // Retry once after 500ms — handles timing race where storage bridge
        // (opalite-inject.js) hasn't registered its listener yet
        return new Promise(function(resolve) {
          setTimeout(function() {
            storageRequest('get', { key: 'opalite_jwt' }).then(resolve);
          }, 500);
        });
      });
    },

    setToken: function(token) {
      return storageRequest('set', { key: 'opalite_jwt', value: token });
    },

    getRefreshToken: function() {
      return storageRequest('get', { key: 'opalite_refresh_token' });
    },

    setRefreshToken: function(token) {
      return storageRequest('set', { key: 'opalite_refresh_token', value: token });
    },

    getUser: function() {
      return storageRequest('get', { key: 'opalite_user' });
    },

    setUser: function(user) {
      return storageRequest('set', { key: 'opalite_user', value: user });
    },

    clearAuth: function() {
      return storageRequest('remove', {
        keys: ['opalite_jwt', 'opalite_user', 'opalite_refresh_token']
      });
    },

    // Full sign out: clears extension storage AND removes the
    // opalitestudios.com session cookie so cookie sync can't re-login
    signOut: function() {
      return storageRequest('signout', {});
    },

    exchangeCode: function(code, extensionType) {
      var self = this;
      return fetch(OPALITE_SERVER + '/api/extension/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, extensionType: extensionType })
      }).then(function(response) {
        if (!response.ok) throw new Error('Failed to exchange auth code');
        return response.json();
      }).then(function(data) {
        return self.setToken(data.jwt).then(function() {
          return self.setUser(data.user);
        }).then(function() {
          if (data.refreshToken) {
            return self.setRefreshToken(data.refreshToken);
          }
        }).then(function() {
          return data;
        });
      });
    },

    refreshAuth: function() {
      var self = this;
      return Promise.all([self.getRefreshToken(), self.getToken()]).then(function(results) {
        var refreshToken = results[0];
        var currentJwt = results[1];
        if (!refreshToken) return false;
        // H10 fix: 10-second timeout prevents hanging indefinitely if server is down
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 10000);
        return fetch(OPALITE_SERVER + '/api/extension/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refreshToken, currentJwt: currentJwt || '' }),
          signal: controller.signal
        }).then(function(response) {
          clearTimeout(timeoutId);
          if (!response.ok) {
            if (response.status === 401) {
              return self.clearAuth().then(function() { return false; });
            }
            return false;
          }
          return response.json().then(function(data) {
            return self.setToken(data.jwt).then(function() {
              return self.setUser(data.user);
            }).then(function() {
              return true;
            });
          });
        }).catch(function(err) {
          console.error('[Opalite] Failed to refresh auth:', err);
          return false;
        });
      });
    },

    getValidToken: function() {
      var self = this;
      return self.getToken().then(function(token) {
        if (!token) return null;
        if (isTokenExpiringSoon(token, 3600)) {
          return self.refreshAuth().then(function(refreshed) {
            if (refreshed) return self.getToken();
            // C2 fix: return null instead of expired token so callers
            // know auth is invalid rather than using a rejected token
            console.warn('[Opalite] Token expired and refresh failed — auth invalid');
            return null;
          });
        }
        return token;
      });
    },

    isAuthenticated: function() {
      return this.getToken().then(function(token) {
        return !!token;
      });
    }
  };

  console.log('[Opalite] Auth helper loaded in page context (MAIN world)');
})();
