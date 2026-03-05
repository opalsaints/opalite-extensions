/**
 * Opalite Storage Bridge — runs in ISOLATED world (content script)
 *
 * Listens for postMessage requests from opalite-auth.js (MAIN world)
 * and relays chrome.storage.local operations, since page scripts
 * cannot access Chrome extension APIs.
 *
 * Handles extension context invalidation gracefully — when Chrome
 * reloads/updates the extension, chrome.* APIs become unavailable.
 * We detect this and notify the MAIN world so it can degrade gracefully.
 */
(function () {
  'use strict';

  // Security: Only allow these storage keys to be accessed via the bridge
  var ALLOWED_KEYS = ['opalite_jwt', 'opalite_user', 'opalite_refresh_token'];

  // Track whether the extension context is still valid
  var contextValid = true;

  function isContextValid() {
    try {
      // Quick check — accessing chrome.runtime.id throws if context is gone
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function sendError(id, errorMsg) {
    window.postMessage({
      source: 'opalite-inject',
      type: 'OPALITE_STORAGE_RESPONSE',
      id: id,
      result: null,
      error: errorMsg,
    }, window.location.origin);
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'opalite-auth') return;
    if (event.data.type !== 'OPALITE_STORAGE') return;

    var id = event.data.id;
    var action = event.data.action;
    var data = event.data.data;

    // Check context before every chrome.* call
    if (!isContextValid()) {
      contextValid = false;
      sendError(id, 'extension_context_invalidated');
      return;
    }

    // Security: Reject unlisted storage keys
    if (action === 'get' || action === 'set') {
      if (!data.key || ALLOWED_KEYS.indexOf(data.key) === -1) {
        sendError(id, 'storage_key_not_allowed');
        return;
      }
    } else if (action === 'remove') {
      var keys = data.keys || [];
      for (var k = 0; k < keys.length; k++) {
        if (ALLOWED_KEYS.indexOf(keys[k]) === -1) {
          sendError(id, 'storage_key_not_allowed');
          return;
        }
      }
    }

    try {
      if (action === 'get') {
        chrome.storage.local.get([data.key], function (result) {
          if (chrome.runtime.lastError) {
            sendError(id, chrome.runtime.lastError.message);
            return;
          }
          window.postMessage({
            source: 'opalite-inject',
            type: 'OPALITE_STORAGE_RESPONSE',
            id: id,
            result: result[data.key] || null,
          }, window.location.origin);
        });
      } else if (action === 'set') {
        chrome.storage.local.set({ [data.key]: data.value }, function () {
          if (chrome.runtime.lastError) {
            sendError(id, chrome.runtime.lastError.message);
            return;
          }
          window.postMessage({
            source: 'opalite-inject',
            type: 'OPALITE_STORAGE_RESPONSE',
            id: id,
            result: true,
          }, window.location.origin);
        });
      } else if (action === 'remove') {
        chrome.storage.local.remove(data.keys, function () {
          if (chrome.runtime.lastError) {
            sendError(id, chrome.runtime.lastError.message);
            return;
          }
          window.postMessage({
            source: 'opalite-inject',
            type: 'OPALITE_STORAGE_RESPONSE',
            id: id,
            result: true,
          }, window.location.origin);
        });
      } else if (action === 'signout') {
        // Full sign out: clear storage + tell background to remove session cookie
        chrome.storage.local.remove(
          ['opalite_jwt', 'opalite_user', 'opalite_refresh_token'],
          function () {
            if (chrome.runtime.lastError) {
              sendError(id, chrome.runtime.lastError.message);
              return;
            }
            // Tell background.js to remove the opalitestudios.com session cookie
            chrome.runtime.sendMessage(
              { source: 'opalite', to: 'background', type: 'signOut' },
              function () {
                window.postMessage({
                  source: 'opalite-inject',
                  type: 'OPALITE_STORAGE_RESPONSE',
                  id: id,
                  result: true,
                }, window.location.origin);
              }
            );
          }
        );
      }
    } catch (e) {
      // Context was invalidated between the check and the call
      contextValid = false;
      sendError(id, 'extension_context_invalidated');
    }
  });

  // Handle resource URL requests from opalite-socket.js (MAIN world)
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'opalite-socket') return;
    if (event.data.type !== 'OPALITE_RESOURCE_URL') return;

    var id = event.data.id;
    var path = event.data.path;

    if (!isContextValid()) {
      // Can't resolve URL, but don't crash — the fallback in opalite-socket.js
      // will use the raw path after a 2s timeout
      return;
    }

    try {
      var url = chrome.runtime.getURL(path);
      window.postMessage({
        source: 'opalite-inject',
        type: 'OPALITE_RESOURCE_URL_RESPONSE',
        id: id,
        url: url,
      }, window.location.origin);
    } catch (e) {
      contextValid = false;
      // Silent fail — opalite-socket.js has a 2s fallback
    }
  });
})();
