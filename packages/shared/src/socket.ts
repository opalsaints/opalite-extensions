/**
 * Opalite Independent Socket Connection — runs in MAIN world
 *
 * Establishes its own socket.io connection to opalitestudios.com,
 * handles the initialCheck/initialChecked handshake, updates the
 * Zustand store, and intercepts download events from main.js.
 *
 * Usage (in a WXT content script with world: 'MAIN'):
 *   import { setupOpaliteSocket } from '@opalite/shared/socket';
 *   setupOpaliteSocket({
 *     extensionType: 'chatgpt',
 *     server: 'https://opalitestudios.com',
 *     appName: 'AutoGPT',
 *     syncInfo: { name: 'Opalite for ChatGPT', website: 'chatgpt.com' },
 *     customDownloadEvent: 'chatgpt-imagine-created',
 *   });
 */

import type { PlatformConfig, OpaliteSocketAPI, DownloadPayload } from './types';

interface SocketConfig {
  extensionType: string;
  server: string;
  appName: string;
  syncInfo: { name: string; website: string };
  customDownloadEvent?: string;
}

type IoClient = (url: string, opts: Record<string, unknown>) => SocketInstance;

interface SocketInstance {
  id: string;
  connected: boolean;
  io: { opts: Record<string, unknown> };
  on(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  connect(): void;
  disconnect(): void;
}

const RECONNECT_DELAY = 5000;
const MAX_TOKEN_WAIT = 30000;
const MAX_PENDING = 50;

// ─── Logging ───────────────────────────────────────────────────
function log(...args: unknown[]): void {
  console.log('[Opalite Socket]', ...args);
}
function warn(...args: unknown[]): void {
  console.warn('[Opalite Socket]', ...args);
}
function err(...args: unknown[]): void {
  console.error('[Opalite Socket]', ...args);
}

// ─── URL Resolution ──────────────────────────────────────────
function getExtensionResourceURL(path: string): Promise<string> {
  return new Promise((resolve) => {
    const id = 'opalite_url_' + Date.now();

    function handler(event: MessageEvent): void {
      if (event.source !== window) return;
      if (!event.data || event.data.type !== 'OPALITE_RESOURCE_URL_RESPONSE') return;
      if (event.data.id !== id) return;
      window.removeEventListener('message', handler);
      resolve(event.data.url);
    }

    window.addEventListener('message', handler);
    window.postMessage(
      {
        source: 'opalite-socket',
        type: 'OPALITE_RESOURCE_URL',
        id,
        path,
      },
      window.location.origin
    );

    // Fallback: if no response in 2s, try direct path
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(path);
    }, 2000);
  });
}

// ─── Wait for JWT ────────────────────────────────────────────
function waitForToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    function check(): void {
      if (!window.__opalite || !window.__opalite.getToken) {
        if (Date.now() - startTime > MAX_TOKEN_WAIT) {
          reject(new Error('Timed out waiting for __opalite.getToken'));
          return;
        }
        setTimeout(check, 500);
        return;
      }

      window.__opalite
        .getToken()
        .then((token) => {
          if (token) {
            resolve(token);
          } else if (Date.now() - startTime > MAX_TOKEN_WAIT) {
            reject(new Error('Timed out waiting for JWT token'));
          } else {
            setTimeout(check, 2000);
          }
        })
        .catch(() => {
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

// ─── Update main.js Zustand store ────────────────────────────
function setDownloaderConnected(connected: boolean): void {
  try {
    if (window.useOpaliteGlobal?.setState) {
      window.useOpaliteGlobal.setState({ isDownloaderConnected: connected });
      log('Updated isDownloaderConnected =', connected);
    }
  } catch (e) {
    warn('Could not update Zustand store:', (e as Error).message);
  }
}

/**
 * Initialize the Opalite socket connection.
 * Can accept a full PlatformConfig or a minimal SocketConfig.
 */
export function setupOpaliteSocket(config: SocketConfig | PlatformConfig): void {
  const {
    extensionType,
    server,
    appName,
    syncInfo,
    customDownloadEvent,
  } = config as SocketConfig & PlatformConfig;

  let socket: SocketInstance | null = null;
  let isConnected = false;
  let limitReached = false;
  const pendingDownloads: Array<{ type: string; data: unknown }> = [];

  // ─── Fetch via Content Script (ISOLATED world) ───────────
  function fetchViaContentScript(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const id =
        'opalite_fetch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      let timeout: ReturnType<typeof setTimeout>;

      function handler(event: MessageEvent): void {
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
      window.postMessage(
        {
          source: appName,
          to: 'content',
          type: 'fetchAsDataUri',
          id,
          url,
        },
        '*'
      );

      timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Content script fetch timed out after 60s'));
      }, 60000);
    });
  }

  // ─── Connect socket ──────────────────────────────────────
  function connectSocket(ioClient: IoClient): void {
    if (socket && socket.connected) {
      log('Already connected');
      return;
    }

    log('Connecting to', server);

    socket = ioClient(server, {
      autoConnect: false,
      timeout: 10000,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      auth: function (cb: (data: { token: string; extensionType: string }) => void) {
        if (window.__opalite?.getValidToken) {
          window.__opalite
            .getValidToken()
            .then((token) => cb({ token: token || '', extensionType }))
            .catch(() => cb({ token: '', extensionType }));
        } else if (window.__opalite?.getToken) {
          window.__opalite
            .getToken()
            .then((token) => cb({ token: token || '', extensionType }))
            .catch(() => cb({ token: '', extensionType }));
        } else {
          cb({ token: '', extensionType });
        }
      },
    });

    // ─── Connection Events ──────────────────────────────
    let connectAttempts = 0;

    socket.on('connect', () => {
      log('Connected! Socket ID:', socket!.id);
      isConnected = true;
      connectAttempts = 0;

      // Flush pending downloads queued during disconnect
      if (pendingDownloads.length > 0) {
        log('Flushing', pendingDownloads.length, 'pending download(s)...');
        const queue = pendingDownloads.splice(0);
        queue.forEach((pending) => {
          if (pending.type === 'single') {
            socket!.emit('download', pending.data, (ack: { success?: boolean; error?: string }) => {
              if (ack?.success) {
                log('Queued download delivered:', (pending.data as DownloadPayload).filename);
              } else {
                warn('Queued download failed:', ack?.error);
              }
            });
          } else if (pending.type === 'bulk') {
            socket!.emit('bulkDownload', pending.data);
          }
        });
      }
    });

    socket.on('connect_error', (error: { message: string }) => {
      err('Connection error:', error.message);
      isConnected = false;
      connectAttempts++;
      if (connectAttempts >= 10) {
        warn('Circuit breaker: stopping reconnection after', connectAttempts, 'failures');
        socket!.io.opts.reconnection = false;
        socket!.disconnect();
        return;
      }
      if (connectAttempts >= 3) {
        warn(
          'Unable to reach Opalite server after',
          connectAttempts,
          'attempts. Check your internet connection.'
        );
      }
    });

    socket.on('disconnect', (reason: string) => {
      warn('Disconnected:', reason);
      isConnected = false;
    });

    // ─── Server-Initiated Handshake ─────────────────────
    socket.on('initialCheck', (data: unknown) => {
      log('Received initialCheck from server:', data);
      socket!.emit('initialChecked', {
        features: {
          bulkDownload: true,
          downloadByExtension: true,
        },
      });
      log('Sent initialChecked response');
    });

    socket.on('connectionChange', (connected: boolean) => {
      log('connectionChange:', connected);
      isConnected = connected;
      if (connected) {
        setDownloaderConnected(true);
      } else {
        limitReached = true;
        if (socket) {
          socket.io.opts.reconnection = false;
          socket.disconnect();
        }
        warn('Extension limit reached — upgrade your plan to connect more extensions.');
      }
    });

    // ─── Plan Status from Server ────────────────────────
    socket.on('planStatus', (data: Record<string, unknown>) => {
      log('Received planStatus:', data?.plan);
      try {
        if (window.useOpaliteGlobal?.setState) {
          const isMember = data.plan !== 'free';
          window.useOpaliteGlobal.setState({
            isMember,
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
        warn('Could not update plan in Zustand store:', (e as Error).message);
      }
    });

    // ─── Download Confirmations ─────────────────────────
    socket.on('extensionDownloaded', (data: { filename?: string; quotaExceeded?: boolean }) => {
      log('Download confirmed by server:', data?.filename);
      if (data?.quotaExceeded) {
        const usage = { used: 0, limit: 0 };
        try {
          if (window.useOpaliteGlobal?.getState) {
            const state = window.useOpaliteGlobal.getState();
            usage.used =
              ((state.planUsage as Record<string, number>)?.download) || 0;
            usage.limit =
              ((state.planLimits as Record<string, number>)?.downloadsPerMonth) || 0;
          }
        } catch { /* ignore */ }
        window.postMessage(
          { type: 'OPALITE_QUOTA_EXCEEDED', used: usage.used, limit: usage.limit },
          '*'
        );
      }
    });

    socket.on('usageUpdate', (data: unknown) => {
      log('Usage update:', data);
    });

    socket.on('mediaAdded', (data: { filename?: string }) => {
      log('Media added to dashboard:', data?.filename);
    });

    // ─── Sync User Info ─────────────────────────────────
    socket.on('connect', () => {
      socket!.emit('syncExtensionInfo', {
        name: syncInfo.name,
        website: syncInfo.website,
        platform: extensionType,
        version: '1.2.0',
        url: location.href,
        title: document.title,
      });

      if (window.__opalite?.getUser) {
        window.__opalite.getUser().then((user) => {
          if (user) {
            socket!.emit('syncUser', {
              name: user.name || '',
              email: user.email || '',
              avatar: user.image || user.avatar || '',
            });
          }
        });
      }
    });

    socket.connect();
  }

  // ─── Intercept Download Events from main.js ──────────────
  function setupDownloadInterceptor(): void {
    window.addEventListener(
      'message',
      (event: MessageEvent) => {
        if (event.source !== window) return;
        if (!event.data || !event.data.source) return;

        const source = (event.data.source || '').toLowerCase();
        const type = event.data.type;

        const ALLOWED_SOURCES = ['opalite'];
        if (!ALLOWED_SOURCES.includes(source)) return;

        if (type === 'downloadImage') {
          const payload = event.data.payload || event.data;
          const downloadData: DownloadPayload = {
            url: payload.url || payload.imageUrl,
            filename: payload.filename || '',
            metadata: {
              source: extensionType,
              prompt: payload.prompt || payload.info?.prompt || '',
              platform: extensionType,
              originalSource: source,
            },
          };

          function sendDownload(data: DownloadPayload): void {
            if (socket && isConnected) {
              log(
                'Sending download to server:',
                data.filename || data.url?.substring(0, 80)
              );
              socket.emit(
                'download',
                data,
                (ack: { success?: boolean; error?: string }) => {
                  if (ack?.success) {
                    log('Download acknowledged by server:', data.filename);
                  } else {
                    warn('Download not acknowledged:', ack?.error);
                  }
                }
              );
            } else {
              warn(
                'Socket disconnected, queuing download:',
                data.filename || data.url?.substring(0, 80)
              );
              if (pendingDownloads.length >= MAX_PENDING) pendingDownloads.shift();
              pendingDownloads.push({ type: 'single', data });
            }
          }

          if (downloadData.url?.startsWith('data:')) {
            log('Intercepted download (data URI):', downloadData.filename);
            sendDownload(downloadData);
          } else if (downloadData.url) {
            log(
              'Intercepted download (URL), fetching via content script:',
              downloadData.filename || downloadData.url.substring(0, 80)
            );
            fetchViaContentScript(downloadData.url)
              .then((dataUri) => {
                log(
                  'Content script fetch succeeded, got data URI (' +
                    Math.round(dataUri.length / 1024) +
                    'KB)'
                );
                downloadData.url = dataUri;
                sendDownload(downloadData);
              })
              .catch((fetchError) => {
                warn(
                  'Content script fetch failed (' +
                    fetchError.message +
                    '), sending raw URL as fallback'
                );
                sendDownload(downloadData);
              });
          }
        }

        if (type === 'bulkDownloadImages') {
          const items: Array<Record<string, unknown>> =
            event.data.payload || event.data.images || [];
          const mappedItems: DownloadPayload[] = items.map((item) => ({
            url: (item.url || item.imageUrl) as string,
            filename: (item.filename || '') as string,
            metadata: {
              source: extensionType,
              prompt: (item.prompt || '') as string,
              platform: extensionType,
            },
          }));

          Promise.all(
            mappedItems.map((item) => {
              if (item.url?.startsWith('data:')) return Promise.resolve(item);
              if (!item.url) return Promise.resolve(item);
              return fetchViaContentScript(item.url)
                .then((dataUri) => {
                  item.url = dataUri;
                  return item;
                })
                .catch(() => item);
            })
          ).then((resolvedItems) => {
            const bulkData = { items: resolvedItems, source: extensionType };
            if (socket && isConnected) {
              log('Intercepted bulk download event:', resolvedItems.length, 'items');
              socket.emit('bulkDownload', bulkData);
            } else {
              warn(
                'Socket disconnected, queuing bulk download:',
                resolvedItems.length,
                'items'
              );
              if (pendingDownloads.length >= MAX_PENDING) pendingDownloads.shift();
              pendingDownloads.push({ type: 'bulk', data: bulkData });
            }
          });
        }
      },
      false
    );

    // Listen for custom download events from compat.js
    if (customDownloadEvent) {
      window.addEventListener(customDownloadEvent, (event: Event) => {
        if (!socket || !isConnected) return;
        const detail = (event as CustomEvent).detail?.imagine;
        if (!detail) return;
        log('Detected', customDownloadEvent, 'event');
      });
    }

    log('Download interceptor ready');
  }

  // ─── Expose socket for debugging ───────────────────────
  const socketAPI: OpaliteSocketAPI = {
    getSocket: () => socket,
    isConnected: () => isConnected,
    isLimitReached: () => limitReached,
    reconnect: () => {
      if (socket) {
        socket.disconnect();
        setTimeout(() => socket!.connect(), 500);
      }
    },
    disconnect: () => {
      if (socket) socket.disconnect();
    },
  };
  window.__opaliteSocket = socketAPI;

  // ─── Watch for Authentication ──────────────────────────
  function watchForAuth(ioClient: IoClient): void {
    const checkInterval = setInterval(() => {
      if (!window.__opalite?.getToken) return;

      window.__opalite.getToken().then((token) => {
        if (token) {
          clearInterval(checkInterval);
          log('JWT appeared! Connecting socket...');
          connectSocket(ioClient);
        }
      });
    }, 2000);

    // Give up after 5 minutes
    setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000);
  }

  // ─── Main Entry Point ─────────────────────────────────
  function main(): void {
    log('Initializing independent socket connection...');

    // Show the panel as soon as main.js has initialized the Zustand store
    const panelInitInterval = setInterval(() => {
      if (window.useOpaliteGlobal?.setState) {
        clearInterval(panelInitInterval);
        setDownloaderConnected(true);
        log('Panel shown — Zustand store ready');
      }
    }, 100);
    setTimeout(() => clearInterval(panelInitInterval), 10000);

    // Get the extension resource URL for socket.io-client
    getExtensionResourceURL('scripts/socket.io.min.js').then((scriptUrl) => {
      // Temporarily hide AMD `define` so socket.io-client UMD build
      // attaches to window.io instead of registering as an AMD module
      const originalDefine = window.define;
      window.define = undefined;

      const script = document.createElement('script');
      script.src = scriptUrl;

      script.onload = () => {
        window.define = originalDefine;

        if (typeof window.io === 'undefined') {
          err('socket.io client loaded but io() not available');
          return;
        }
        log('socket.io client ready');

        setupDownloadInterceptor();

        waitForToken()
          .then(() => {
            log('JWT available, connecting socket...');
            connectSocket(window.io as IoClient);
          })
          .catch((error) => {
            warn('No JWT available:', error.message);
            log('Socket will not connect — user needs to authenticate first');
            watchForAuth(window.io as IoClient);
          });
      };

      script.onerror = () => {
        window.define = originalDefine;
        err('Failed to load socket.io client from:', scriptUrl);
      };

      if (document.head) {
        document.head.appendChild(script);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          document.head.appendChild(script);
        });
      }
    });
  }

  // ─── Start ─────────────────────────────────────────────
  function startWhenReady(): void {
    setTimeout(main, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWhenReady);
  } else {
    startWhenReady();
  }
}
