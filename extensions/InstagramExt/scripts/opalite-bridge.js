/**
 * Opalite Bridge — Content script for Instagram extension.
 * Connects to the Opalite server via Socket.io and handles:
 * 1. instagramPost commands from server (dashboard or scheduler)
 * 2. instagramStatusCheck requests
 * 3. Login status detection
 *
 * Requires socket.io.min.js to be loaded before this script.
 */

(function () {
  'use strict';

  const SERVER = 'https://opalitestudios.com';
  const EXTENSION_TYPE = 'instagram';
  const STORAGE_JWT_KEY = 'opalite_jwt';
  const RECONNECT_DELAY = 5000;
  const STATUS_CHECK_INTERVAL = 30000; // 30s

  let socket = null;
  let reconnectTimer = null;

  // ─── Storage helpers ──────────────────────────────────────────
  function getStorage(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => resolve(result[key] || null));
    });
  }

  // ─── Send message to background script ────────────────────────
  function sendToBg(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ ...message, _opalite: true }, resolve);
    });
  }

  // ─── Instagram login detection ────────────────────────────────
  function detectInstagramLogin() {
    // Check for ds_user_id cookie presence via background
    return sendToBg({ type: 'OPALITE_GET_IG_COOKIES' }).then((res) => {
      if (!res || !res.success) return { loggedIn: false };
      const cookies = res.cookies || {};
      if (cookies.ds_user_id && cookies.csrftoken) {
        return { loggedIn: true, username: null }; // Username fetched separately
      }
      return { loggedIn: false };
    });
  }

  // Try to get Instagram username from the page
  function getInstagramUsername() {
    try {
      // Try to find username from meta tags or page scripts
      const metaTag = document.querySelector('meta[property="al:ios:url"]');
      if (metaTag) {
        const match = metaTag.content.match(/user\?username=([^&]+)/);
        if (match) return match[1];
      }

      // Check for logged-in user indicator in DOM
      const profileLink = document.querySelector(
        'a[href^="/"][role="link"] span'
      );
      // Fallback: check cookie-based username
      return null;
    } catch {
      return null;
    }
  }

  // ─── Handle instagramPost from server ─────────────────────────
  async function handleInstagramPost(data) {
    const { postId, mediaR2Url, caption } = data;
    console.log('[opalite-bridge] Received instagramPost:', postId);

    try {
      // 1. Fetch image from R2 via background (cross-origin)
      const imageResult = await sendToBg({
        type: 'OPALITE_FETCH_IMAGE',
        url: mediaR2Url,
      });

      if (!imageResult || !imageResult.success) {
        throw new Error(imageResult?.error || 'Failed to fetch image');
      }

      // 2. Post to Instagram via background
      const postResult = await sendToBg({
        type: 'OPALITE_POST_TO_INSTAGRAM',
        imageData: {
          base64: imageResult.base64,
          contentType: imageResult.contentType,
        },
        caption: caption || '',
      });

      if (!postResult || !postResult.success) {
        throw new Error(postResult?.error || 'Instagram post failed');
      }

      // 3. Report success to server
      socket.emit('instagramPostResult', {
        postId,
        success: true,
        igMediaId: postResult.igMediaId,
        igPostCode: postResult.igPostCode,
      });

      console.log('[opalite-bridge] Post successful:', postResult.igPostCode);
    } catch (err) {
      console.error('[opalite-bridge] Post failed:', err.message);

      socket.emit('instagramPostResult', {
        postId,
        success: false,
        error: err.message,
      });
    }
  }

  // ─── Handle instagramStatusCheck from server ──────────────────
  async function handleStatusCheck(data) {
    console.log('[opalite-bridge] Status check requested');
    const status = await detectInstagramLogin();
    const username = status.loggedIn ? getInstagramUsername() : undefined;

    socket.emit('instagramStatus', {
      loggedIn: status.loggedIn,
      username: username || undefined,
    });
  }

  // ─── Connect Socket.io ────────────────────────────────────────
  async function connectSocket() {
    const token = await getStorage(STORAGE_JWT_KEY);

    if (!token) {
      console.log('[opalite-bridge] No JWT token found. Waiting for login...');
      scheduleReconnect();
      return;
    }

    if (socket && socket.connected) {
      console.log('[opalite-bridge] Already connected');
      return;
    }

    // Disconnect existing socket if any
    if (socket) {
      socket.disconnect();
      socket = null;
    }

    try {
      socket = io(SERVER, {
        auth: {
          token: token,
          extensionType: EXTENSION_TYPE,
        },
        timeout: 10000, // PB-2: 10s connection timeout
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: Infinity,
      });

      let connectAttempts = 0;

      socket.on('connect', () => {
        console.log('[opalite-bridge] Connected to Opalite server');
        connectAttempts = 0; // PB-2: Reset counter on success

        // Send initial check
        socket.emit('initialCheck', {
          extensionType: EXTENSION_TYPE,
          version: '1.0.0',
        });

        // Report current Instagram status
        detectInstagramLogin().then((status) => {
          const username = status.loggedIn ? getInstagramUsername() : undefined;
          socket.emit('instagramStatus', {
            loggedIn: status.loggedIn,
            username: username || undefined,
          });
        });
      });

      socket.on('initialChecked', (data) => {
        console.log('[opalite-bridge] Server acknowledged:', data);
      });

      // Listen for post commands from server
      socket.on('instagramPost', handleInstagramPost);

      // Listen for status check requests
      socket.on('instagramStatusCheck', handleStatusCheck);

      // Toast notifications
      socket.on('toast', (data) => {
        console.log(`[opalite-bridge] Toast: ${data.type} — ${data.message}`);
      });

      socket.on('disconnect', (reason) => {
        console.log('[opalite-bridge] Disconnected:', reason);
      });

      socket.on('connect_error', (err) => {
        console.error('[opalite-bridge] Connection error:', err.message);
        connectAttempts++;
        if (connectAttempts >= 3) {
          console.warn('[opalite-bridge] Unable to reach server after', connectAttempts, 'attempts.');
        }
      });
    } catch (err) {
      console.error('[opalite-bridge] Socket init error:', err);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSocket, RECONNECT_DELAY);
  }

  // ─── Periodic login status check ──────────────────────────────
  setInterval(async () => {
    if (!socket || !socket.connected) return;

    const status = await detectInstagramLogin();
    const username = status.loggedIn ? getInstagramUsername() : undefined;
    socket.emit('instagramStatus', {
      loggedIn: status.loggedIn,
      username: username || undefined,
    });
  }, STATUS_CHECK_INTERVAL);

  // ─── Listen for storage changes (new JWT) ─────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_JWT_KEY]) {
      console.log('[opalite-bridge] JWT token changed, reconnecting...');
      if (socket) socket.disconnect();
      connectSocket();
    }
  });

  // ─── Initialize ───────────────────────────────────────────────
  connectSocket();
})();
