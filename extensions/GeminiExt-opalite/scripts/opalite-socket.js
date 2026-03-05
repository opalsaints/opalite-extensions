/**
 * Opalite Independent Socket Connection
 *
 * Runs in MAIN world. Bypasses main.js's complex React lifecycle gating
 * by establishing its own socket.io connection to opalitestudios.com.
 *
 * This script:
 * 1. Waits for JWT to be available (user authenticated)
 * 2. Loads socket.io-client (standalone, bundled in extension)
 * 3. Connects to opalitestudios.com with JWT auth
 * 4. Handles initialCheck → initialChecked handshake
 * 5. Updates main.js's Zustand store (isDownloaderConnected)
 * 6. Intercepts download events from main.js and forwards to server
 * 7. Handles extensionDownloaded confirmations from server
 */
(function () {
  'use strict';

  var OPALITE_SERVER = 'https://opalitestudios.com';
  var EXTENSION_TYPE = 'gemini';
  var RECONNECT_DELAY = 5000;
  var MAX_TOKEN_WAIT = 30000; // 30s max wait for JWT
  var socket = null;
  var isConnected = false;
  var limitReached = false; // true when server rejects connection due to plan extension limit
  var pendingDownloads = []; // C1: Queue downloads that fail during disconnect
  var MAX_PENDING = 50; // Cap pending queue to prevent memory growth

  // ─── Logging ───────────────────────────────────────────────────
  function log() {
    var args = ['[Opalite Socket]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }
  function warn() {
    var args = ['[Opalite Socket]'].concat(Array.prototype.slice.call(arguments));
    console.warn.apply(console, args);
  }
  function err() {
    var args = ['[Opalite Socket]'].concat(Array.prototype.slice.call(arguments));
    console.error.apply(console, args);
  }

  // ─── Load socket.io client ────────────────────────────────────
  function loadSocketIOClient() {
    return new Promise(function (resolve, reject) {
      // Check if io is already available globally (e.g. from main.js)
      if (typeof io !== 'undefined') {
        log('socket.io client already available globally');
        resolve(io);
        return;
      }

      // Load our bundled socket.io-client
      var script = document.createElement('script');
      script.src = (window.__opalite && window.__opalite._extensionUrl
        ? window.__opalite._extensionUrl
        : '') + 'scripts/socket.io.min.js';

      // Try chrome extension URL approach
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        try {
          script.src = chrome.runtime.getURL('scripts/socket.io.min.js');
        } catch (e) {
          // MAIN world can't use chrome.runtime — use postMessage to get URL
        }
      }

      script.onload = function () {
        if (typeof io !== 'undefined') {
          log('socket.io client loaded successfully');
          resolve(io);
        } else {
          reject(new Error('socket.io loaded but io not defined'));
        }
      };
      script.onerror = function () {
        reject(new Error('Failed to load socket.io client script'));
      };
      document.head.appendChild(script);
    });
  }

  // ─── Wait for JWT ─────────────────────────────────────────────
  function waitForToken() {
    return new Promise(function (resolve, reject) {
      var startTime = Date.now();

      function check() {
        if (!window.__opalite || !window.__opalite.getToken) {
          if (Date.now() - startTime > MAX_TOKEN_WAIT) {
            reject(new Error('Timed out waiting for __opalite.getToken'));
            return;
          }
          setTimeout(check, 500);
          return;
        }

        window.__opalite.getToken().then(function (token) {
          if (token) {
            resolve(token);
          } else if (Date.now() - startTime > MAX_TOKEN_WAIT) {
            reject(new Error('Timed out waiting for JWT token'));
          } else {
            setTimeout(check, 2000); // Check every 2s for token
          }
        }).catch(function () {
          if (Date.now() - startTime > MAX_TOKEN_WAIT) {
            reject(new Error('Error getting token'));
          } else {
            setTimeout(check, 2000);
          }
        });
      }

      check();
    });
  }

  // ─── Update main.js Zustand store ─────────────────────────────
  function setDownloaderConnected(connected) {
    try {
      if (window.useOpaliteGlobal && window.useOpaliteGlobal.setState) {
        window.useOpaliteGlobal.setState({ isDownloaderConnected: connected });
        log('Updated isDownloaderConnected =', connected);
      }
    } catch (e) {
      warn('Could not update Zustand store:', e.message);
    }
  }

  // ─── Connect socket ───────────────────────────────────────────
  function connectSocket(ioClient) {
    if (socket && socket.connected) {
      log('Already connected');
      return;
    }

    log('Connecting to', OPALITE_SERVER);

    socket = ioClient(OPALITE_SERVER, {
      autoConnect: false,
      timeout: 10000, // PB-2: 10s connection timeout
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      auth: function (cb) {
        // Get fresh token each time (handles token refresh)
        if (window.__opalite && window.__opalite.getValidToken) {
          window.__opalite.getValidToken().then(function (token) {
            cb({ token: token || '', extensionType: EXTENSION_TYPE });
          }).catch(function () {
            cb({ token: '', extensionType: EXTENSION_TYPE });
          });
        } else if (window.__opalite && window.__opalite.getToken) {
          window.__opalite.getToken().then(function (token) {
            cb({ token: token || '', extensionType: EXTENSION_TYPE });
          }).catch(function () {
            cb({ token: '', extensionType: EXTENSION_TYPE });
          });
        } else {
          cb({ token: '', extensionType: EXTENSION_TYPE });
        }
      }
    });

    // ─── Connection Events ────────────────────────────────────
    var connectAttempts = 0;

    socket.on('connect', function () {
      log('Connected! Socket ID:', socket.id);
      isConnected = true;
      connectAttempts = 0; // PB-2: Reset counter on success

      // C1: Flush pending downloads queued during disconnect
      if (pendingDownloads.length > 0) {
        log('Flushing', pendingDownloads.length, 'pending download(s)...');
        var queue = pendingDownloads.splice(0);
        queue.forEach(function(pending) {
          if (pending.type === 'single') {
            socket.emit('download', pending.data, function(ack) {
              if (ack && ack.success) {
                log('Queued download delivered:', pending.data.filename);
              } else {
                warn('Queued download failed:', ack && ack.error);
              }
            });
          } else if (pending.type === 'bulk') {
            socket.emit('bulkDownload', pending.data);
          }
        });
      }
    });

    socket.on('connect_error', function (error) {
      err('Connection error:', error.message);
      isConnected = false;
      // Don't hide the panel on transient connection errors — only an explicit
      // connectionChange(false) from the server should affect panel visibility.
      connectAttempts++;
      if (connectAttempts >= 10) {
        // Circuit breaker: stop reconnecting after 10 consecutive failures
        warn('Circuit breaker: stopping reconnection after', connectAttempts, 'failures');
        socket.io.opts.reconnection = false;
        socket.disconnect();
        return;
      }
      if (connectAttempts >= 3) {
        warn('Unable to reach Opalite server after', connectAttempts, 'attempts. Check your internet connection.');
      }
    });

    socket.on('disconnect', function (reason) {
      warn('Disconnected:', reason);
      isConnected = false;
      // Don't hide the panel on disconnect — the socket will reconnect automatically.
      // Panel visibility is controlled only by connectionChange events from the server.
    });

    // ─── Server-Initiated Handshake ───────────────────────────
    // Server sends initialCheck → we respond with initialChecked
    // Server then sends connectionChange(true) to confirm
    socket.on('initialCheck', function (data) {
      log('Received initialCheck from server:', data);
      socket.emit('initialChecked', {
        features: {
          bulkDownload: true,
          downloadByExtension: true
        }
      });
      log('Sent initialChecked response');
    });

    socket.on('connectionChange', function (connected) {
      log('connectionChange:', connected);
      isConnected = connected;
      if (connected) {
        setDownloaderConnected(true);
      } else {
        // Server explicitly rejected this extension (e.g. free plan extension limit).
        // Keep the panel visible — the popup will show the upgrade prompt.
        // Stop reconnecting so we don't hammer the server with rejected connections.
        limitReached = true;
        if (socket) {
          socket.io.opts.reconnection = false;
          socket.disconnect();
        }
        warn('Extension limit reached — upgrade your plan to connect more extensions.');
      }
    });

    // ─── Plan Status from Server (S6) ─────────────────────────
    // Server sends planStatus after handshake and on Stripe plan changes.
    // Updates the Zustand store so main.js UI reflects the real plan.
    socket.on('planStatus', function (data) {
      log('Received planStatus:', data && data.plan);
      try {
        if (window.useOpaliteGlobal && window.useOpaliteGlobal.setState) {
          var isMember = data.plan !== 'free';
          window.useOpaliteGlobal.setState({
            isMember: isMember,
            userPlan: data.plan,
            planLimits: data.limits,
            planUsage: data.usage,
            planCredits: data.credits || null,
            storageUsedBytes: data.storageUsedBytes,
            storageQuotaBytes: data.storageQuotaBytes,
          });
          log('Updated Zustand store: isMember=' + isMember + ', plan=' + data.plan);
        }
      } catch (e) {
        warn('Could not update plan in Zustand store:', e.message);
      }
    });

    // ─── Download Confirmations ───────────────────────────────
    socket.on('extensionDownloaded', function (data) {
      log('Download confirmed by server:', data && data.filename);
      // Trigger upsell modal when server reports quota exceeded
      if (data && data.quotaExceeded) {
        var usage = { used: 0, limit: 0 };
        try {
          if (window.useOpaliteGlobal && window.useOpaliteGlobal.getState) {
            var state = window.useOpaliteGlobal.getState();
            usage.used = (state.planUsage && state.planUsage.download) || 0;
            usage.limit = (state.planLimits && state.planLimits.downloadsPerMonth) || 0;
          }
        } catch (e) { /* ignore */ }
        window.postMessage({
          type: 'OPALITE_QUOTA_EXCEEDED',
          used: usage.used,
          limit: usage.limit
        }, '*');
      }
    });

    socket.on('usageUpdate', function (data) {
      log('Usage update:', data);
    });

    socket.on('mediaAdded', function (data) {
      log('Media added to dashboard:', data && data.filename);
    });

    // ─── Sync User Info ───────────────────────────────────────
    socket.on('connect', function () {
      // Send extension info after connection
      socket.emit('syncExtensionInfo', {
        name: 'Opalite for Gemini',
        website: 'gemini.google.com',
        platform: 'gemini',
        version: '1.2.0',
        url: location.href,
        title: document.title
      });

      // Send user info if available
      if (window.__opalite && window.__opalite.getUser) {
        window.__opalite.getUser().then(function (user) {
          if (user) {
            socket.emit('syncUser', {
              name: user.name || '',
              email: user.email || '',
              avatar: user.image || user.avatar || ''
            });
          }
        });
      }
    });

    // Now actually connect
    socket.connect();
  }

  // ─── Fetch via Content Script (ISOLATED world) ───────────────
  // The ISOLATED world content script has host_permissions for *.google.com,
  // bypassing CORS and CDN challenges that block MAIN world fetch().
  function fetchViaContentScript(url) {
    return new Promise(function (resolve, reject) {
      var id = 'opalite_fetch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      var timeout;

      function handler(event) {
        if (event.source !== window) return;
        if (!event.data) return;
        if (event.data.type === 'fetchAsDataUri:' + id) {
          window.removeEventListener('message', handler);
          clearTimeout(timeout);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else if (event.data.dataUri) {
            resolve(event.data.dataUri);
          } else {
            reject(new Error('No data URI in response'));
          }
        }
      }

      window.addEventListener('message', handler);
      window.postMessage({
        source: 'AutoGemini',
        to: 'content',
        type: 'fetchAsDataUri',
        id: id,
        url: url
      }, '*');

      timeout = setTimeout(function () {
        window.removeEventListener('message', handler);
        reject(new Error('Content script fetch timed out after 60s'));
      }, 60000);
    });
  }

  // ─── Intercept Download Events from main.js ──────────────────
  // main.js sends downloads via window.postMessage to content.js
  // We intercept these and ALSO forward them to our server socket
  function setupDownloadInterceptor() {
    window.addEventListener('message', function (event) {
      if (event.source !== window) return;
      if (!event.data || !event.data.source) return;

      var source = (event.data.source || '').toLowerCase();
      var type = event.data.type;

      // Security: explicit allowlist of known extension sources
      var allowedSources = ['opalite'];
      if (allowedSources.indexOf(source) === -1) return;

      if (type === 'downloadImage') {
        var payload = event.data.payload || event.data;
        var downloadData = {
          url: payload.url || payload.imageUrl,
          filename: payload.filename || '',
          metadata: {
            source: EXTENSION_TYPE,
            prompt: payload.prompt || payload.info && payload.info.prompt || '',
            platform: EXTENSION_TYPE,
            originalSource: source
          }
        };

        // Helper: send download to server (or queue if disconnected)
        function sendDownload(data) {
          if (socket && isConnected) {
            log('Sending download to server:', data.filename || (data.url && data.url.substring(0, 80)));
            socket.emit('download', data, function(ack) {
              if (ack && ack.success) {
                log('Download acknowledged by server:', data.filename);
              } else {
                warn('Download not acknowledged:', ack && ack.error);
              }
            });
          } else {
            warn('Socket disconnected, queuing download:', data.filename || (data.url && data.url.substring(0, 80)));
            if (pendingDownloads.length >= MAX_PENDING) pendingDownloads.shift();
            pendingDownloads.push({ type: 'single', data: data });
          }
        }

        // If URL is already a data URI, send directly to server
        if (downloadData.url && downloadData.url.startsWith('data:')) {
          log('Intercepted download (data URI):', downloadData.filename);
          sendDownload(downloadData);
        } else if (downloadData.url) {
          // Non-data-URI: fetch via ISOLATED world content script to bypass CORS/CDN.
          log('Intercepted download (URL), fetching via content script:', downloadData.filename || downloadData.url.substring(0, 80));
          fetchViaContentScript(downloadData.url).then(function(dataUri) {
            log('Content script fetch succeeded, got data URI (' + Math.round(dataUri.length / 1024) + 'KB)');
            downloadData.url = dataUri;
            sendDownload(downloadData);
          }).catch(function(fetchError) {
            warn('Content script fetch failed (' + fetchError.message + '), sending raw URL as fallback');
            sendDownload(downloadData);
          });
        }
      }

      if (type === 'bulkDownloadImages') {
        var items = event.data.payload || event.data.images || [];
        var mappedItems = items.map(function (item) {
          return {
            url: item.url || item.imageUrl,
            filename: item.filename || '',
            metadata: {
              source: EXTENSION_TYPE,
              prompt: item.prompt || '',
              platform: EXTENSION_TYPE
            }
          };
        });

        // Convert non-data-URI URLs via content script before sending
        Promise.all(mappedItems.map(function (item) {
          if (item.url && item.url.startsWith('data:')) return Promise.resolve(item);
          if (!item.url) return Promise.resolve(item);
          return fetchViaContentScript(item.url).then(function (dataUri) {
            item.url = dataUri;
            return item;
          }).catch(function () {
            return item; // Fall back to raw URL
          });
        })).then(function (resolvedItems) {
          var bulkData = { items: resolvedItems, source: EXTENSION_TYPE };
          if (socket && isConnected) {
            log('Intercepted bulk download event:', resolvedItems.length, 'items');
            socket.emit('bulkDownload', bulkData);
          } else {
            warn('Socket disconnected, queuing bulk download:', resolvedItems.length, 'items');
            if (pendingDownloads.length >= MAX_PENDING) pendingDownloads.shift();
            pendingDownloads.push({ type: 'bulk', data: bulkData });
          }
        });
      }
    }, false);

    // Also listen for custom download events from compat.js
    window.addEventListener('gemini-imagine-created', function (event) {
      if (!socket || !isConnected) return;
      var detail = event.detail && event.detail.imagine;
      if (!detail) return;
      log('Detected gemini-imagine-created event');
      // The actual download is handled by main.js which will postMessage
      // We just log for debugging
    });

    log('Download interceptor ready');
  }

  // ─── Expose socket for debugging ──────────────────────────────
  window.__opaliteSocket = {
    getSocket: function () { return socket; },
    isConnected: function () { return isConnected; },
    isLimitReached: function () { return limitReached; },
    reconnect: function () {
      if (socket) {
        socket.disconnect();
        setTimeout(function () { socket.connect(); }, 500);
      }
    },
    disconnect: function () {
      if (socket) socket.disconnect();
    }
  };

  // ─── URL Resolution for socket.io-client script ───────────────
  // In MAIN world we can't use chrome.runtime.getURL directly,
  // so we ask the ISOLATED world (opalite-inject.js) for the URL
  function getExtensionResourceURL(path) {
    return new Promise(function (resolve) {
      var id = 'opalite_url_' + Date.now();

      function handler(event) {
        if (event.source !== window) return;
        if (!event.data || event.data.type !== 'OPALITE_RESOURCE_URL_RESPONSE') return;
        if (event.data.id !== id) return;
        window.removeEventListener('message', handler);
        resolve(event.data.url);
      }

      window.addEventListener('message', handler);
      window.postMessage({
        source: 'opalite-socket',
        type: 'OPALITE_RESOURCE_URL',
        id: id,
        path: path
      }, window.location.origin);

      // Fallback: if no response in 2s, try direct path
      setTimeout(function () {
        window.removeEventListener('message', handler);
        resolve(path);
      }, 2000);
    });
  }

  // ─── Main Entry Point ─────────────────────────────────────────
  function main() {
    log('Initializing independent socket connection...');

    // Show the panel as soon as main.js has initialized the Zustand store.
    // The original AutoJourney Downloader always showed the panel on page load
    // (localhost:28080 was always available). We mirror that UX: panel is visible
    // immediately, and the socket connection / auth happens in the background.
    var panelInitInterval = setInterval(function () {
      if (window.useOpaliteGlobal && window.useOpaliteGlobal.setState) {
        clearInterval(panelInitInterval);
        setDownloaderConnected(true);
        log('Panel shown — Zustand store ready');
      }
    }, 100);
    // Give up after 10s — if main.js hasn't initialized by then, something is wrong
    setTimeout(function () { clearInterval(panelInitInterval); }, 10000);

    // Step 1: Get the extension resource URL for socket.io-client
    getExtensionResourceURL('scripts/socket.io.min.js').then(function (scriptUrl) {
      // Step 2: Load socket.io client
      // IMPORTANT: Temporarily hide AMD `define` so socket.io-client UMD build
      // attaches to window.io instead of registering as an AMD module.
      // (grok.com and other sites may have AMD loaders that intercept UMD builds)
      var originalDefine = window.define;
      window.define = undefined;

      var script = document.createElement('script');
      script.src = scriptUrl;

      script.onload = function () {
        // Restore AMD define
        window.define = originalDefine;

        if (typeof io === 'undefined') {
          err('socket.io client loaded but io() not available');
          return;
        }
        log('socket.io client ready');

        // Step 3: Set up download interceptor immediately
        setupDownloadInterceptor();

        // Step 4: Wait for JWT token, then connect
        waitForToken().then(function (token) {
          log('JWT available, connecting socket...');
          connectSocket(io);
        }).catch(function (error) {
          warn('No JWT available:', error.message);
          log('Socket will not connect — user needs to authenticate first');

          // Watch for auth changes (user might log in later)
          watchForAuth(io);
        });
      };

      script.onerror = function () {
        // Restore AMD define on error too
        window.define = originalDefine;
        err('Failed to load socket.io client from:', scriptUrl);
      };

      // Wait for document.head to exist
      if (document.head) {
        document.head.appendChild(script);
      } else {
        document.addEventListener('DOMContentLoaded', function () {
          document.head.appendChild(script);
        });
      }
    });
  }

  // ─── Watch for Authentication ─────────────────────────────────
  // If user wasn't authenticated at load time, watch for token changes
  function watchForAuth(ioClient) {
    var checkInterval = setInterval(function () {
      if (!window.__opalite || !window.__opalite.getToken) return;

      window.__opalite.getToken().then(function (token) {
        if (token) {
          clearInterval(checkInterval);
          log('JWT appeared! Connecting socket...');
          connectSocket(ioClient);
        }
      });
    }, 2000); // Check every 2 seconds

    // Give up after 5 minutes
    setTimeout(function () {
      clearInterval(checkInterval);
    }, 5 * 60 * 1000);
  }

  // ─── Start ─────────────────────────────────────────────────────
  // IMPORTANT: We must wait for DOMContentLoaded so that:
  // 1. opalite-inject.js (ISOLATED world) has registered its postMessage listener
  // 2. document.head exists for script injection
  // 3. The storage bridge is ready for getToken() calls
  // The 1500ms extra delay ensures the ISOLATED world bridge is fully operational.
  function startWhenReady() {
    setTimeout(main, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWhenReady);
  } else {
    startWhenReady();
  }
})();
