/**
 * Opalite Auth Helper — injected into extension pages
 * Handles JWT token management for Socket.io auth with the Opalite server.
 *
 * Usage: Include this script before main.js in the extension.
 * It exposes window.__opalite with token management methods.
 */
(function() {
  const OPALITE_SERVER = 'https://opalitestudios.com';
  const STORAGE_KEY = 'opalite_jwt';
  const STORAGE_USER_KEY = 'opalite_user';
  const STORAGE_REFRESH_KEY = 'opalite_refresh_token';

  /**
   * Decode a JWT payload without verifying signature.
   * Used client-side only to check expiry.
   */
  function decodeJwtPayload(token) {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload));
    } catch {
      return null;
    }
  }

  /**
   * Check if a JWT will expire within the given number of seconds.
   */
  function isTokenExpiringSoon(token, withinSeconds = 3600) {
    const payload = decodeJwtPayload(token);
    if (!payload || !payload.exp) return true;
    const now = Math.floor(Date.now() / 1000);
    return payload.exp - now < withinSeconds;
  }

  window.__opalite = {
    server: OPALITE_SERVER,

    /** Get stored JWT token */
    async getToken() {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get([STORAGE_KEY], (result) => {
            resolve(result[STORAGE_KEY] || null);
          });
        } else {
          resolve(localStorage.getItem(STORAGE_KEY));
        }
      });
    },

    /** Store JWT token */
    async setToken(token) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ [STORAGE_KEY]: token }, resolve);
        } else {
          localStorage.setItem(STORAGE_KEY, token);
          resolve();
        }
      });
    },

    /** Get stored refresh token */
    async getRefreshToken() {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get([STORAGE_REFRESH_KEY], (result) => {
            resolve(result[STORAGE_REFRESH_KEY] || null);
          });
        } else {
          resolve(localStorage.getItem(STORAGE_REFRESH_KEY));
        }
      });
    },

    /** Store refresh token */
    async setRefreshToken(token) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ [STORAGE_REFRESH_KEY]: token }, resolve);
        } else {
          localStorage.setItem(STORAGE_REFRESH_KEY, token);
          resolve();
        }
      });
    },

    /** Get stored user info */
    async getUser() {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get([STORAGE_USER_KEY], (result) => {
            resolve(result[STORAGE_USER_KEY] || null);
          });
        } else {
          try {
            resolve(JSON.parse(localStorage.getItem(STORAGE_USER_KEY)));
          } catch {
            resolve(null);
          }
        }
      });
    },

    /** Store user info */
    async setUser(user) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ [STORAGE_USER_KEY]: user }, resolve);
        } else {
          localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
          resolve();
        }
      });
    },

    /** Clear auth data (logout) */
    async clearAuth() {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.remove(
            [STORAGE_KEY, STORAGE_USER_KEY, STORAGE_REFRESH_KEY],
            resolve
          );
        } else {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(STORAGE_USER_KEY);
          localStorage.removeItem(STORAGE_REFRESH_KEY);
          resolve();
        }
      });
    },

    /**
     * Exchange auth code for JWT + refresh token.
     * Called after the web auth flow redirects back with a code.
     */
    async exchangeCode(code, extensionType) {
      const response = await fetch(`${OPALITE_SERVER}/api/extension/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, extensionType }),
      });

      if (!response.ok) {
        throw new Error('Failed to exchange auth code');
      }

      const data = await response.json();
      await this.setToken(data.jwt);
      await this.setUser(data.user);
      if (data.refreshToken) {
        await this.setRefreshToken(data.refreshToken);
      }
      return data;
    },

    /**
     * Refresh the JWT using the stored refresh token.
     * Fetches the user's CURRENT plan from the server.
     * Returns true if refresh succeeded, false otherwise.
     */
    async refreshAuth() {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) return false;

      // H10 fix: 10-second timeout prevents hanging indefinitely if server is down
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${OPALITE_SERVER}/api/extension/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          // Refresh token is invalid/expired — clear auth
          if (response.status === 401) {
            await this.clearAuth();
          }
          return false;
        }

        const data = await response.json();
        await this.setToken(data.jwt);
        await this.setUser(data.user);
        return true;
      } catch (err) {
        clearTimeout(timeoutId);
        console.error('[Opalite] Failed to refresh auth:', err);
        return false;
      }
    },

    /**
     * Get a valid token, refreshing if needed.
     * This is the preferred method for getting a token before Socket.io connection.
     */
    async getValidToken() {
      let token = await this.getToken();
      if (!token) return null;

      // If token expires within 1 hour, refresh it
      if (isTokenExpiringSoon(token, 3600)) {
        const refreshed = await this.refreshAuth();
        if (refreshed) {
          token = await this.getToken();
        } else {
          // C2 fix: return null instead of expired token so callers
          // know auth is invalid rather than using a rejected token
          console.warn('[Opalite] Token expired and refresh failed — auth invalid');
          return null;
        }
      }

      return token;
    },

    /** Check if user is authenticated */
    async isAuthenticated() {
      const token = await this.getToken();
      return !!token;
    },
  };
})();
