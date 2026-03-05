/* Opalite Popup — Instagram Extension */
const SERVER = 'https://opalitestudios.com';
const PLATFORM_HOSTS = ['instagram.com', 'www.instagram.com'];
const PLATFORM_NAME = 'Instagram';
const EXTENSION_TYPE = 'instagram';

const STORAGE_JWT_KEY = 'opalite_jwt';
const STORAGE_USER_KEY = 'opalite_user';

const $loading = document.getElementById('loading');
const $main = document.getElementById('main-content');

function show(html) {
  $loading.style.display = 'none';
  $main.style.display = 'block';
  $main.innerHTML = html;
}

function getStorage(key) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([key], (result) => resolve(result[key] || null));
    } else {
      resolve(localStorage.getItem(key));
    }
  });
}

function clearStorage(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(keys, resolve);
    } else {
      keys.forEach((k) => localStorage.removeItem(k));
      resolve();
    }
  });
}

function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload);
  } catch { return null; }
}

async function init() {
  const [token, userJson] = await Promise.all([
    getStorage(STORAGE_JWT_KEY),
    getStorage(STORAGE_USER_KEY),
  ]);

  // Check current tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = (tabs[0] && tabs[0].url) || '';
    const onPlatform = PLATFORM_HOSTS.some((h) => url.includes(h));

    if (!token) {
      showLoggedOut(onPlatform);
    } else {
      const claims = decodeJwt(token);
      const user = userJson ? (typeof userJson === 'string' ? JSON.parse(userJson) : userJson) : null;
      showLoggedIn(user, claims, onPlatform);
    }
  });
}

function showLoggedOut(onPlatform) {
  let html = `
    <div class="content">
      <div class="status-row">
        <span class="status-dot offline"></span>
        <span class="status-text">Not connected to Opalite</span>
      </div>
      <div class="actions">
        <a href="${SERVER}/api/extension/auth?type=${EXTENSION_TYPE}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
          Sign in to Opalite
        </a>`;

  if (!onPlatform) {
    html += `
      <div class="wrong-site" style="margin-top:12px;">
        Open <a href="https://${PLATFORM_HOSTS[0]}/" target="_blank" rel="noopener noreferrer">${PLATFORM_NAME}</a> to start posting images.
      </div>`;
  }

  html += `</div></div>`;
  show(html);
}

function showLoggedIn(user, claims, onPlatform) {
  const name = (user && user.name) || (claims && claims.name) || 'User';
  const plan = (claims && claims.plan) || 'free';
  const initial = name.charAt(0).toUpperCase();

  let html = `
    <div class="content">
      <div class="status-row">
        <span class="status-dot online"></span>
        <span class="status-text">Connected to Opalite</span>
      </div>
      <div class="user-info">
        <div class="avatar">${initial}</div>
        <div>
          <div class="user-name">${escapeHtml(name)}</div>
          <span class="plan-badge">${plan}</span>
        </div>
      </div>`;

  if (!onPlatform) {
    html += `
      <div class="wrong-site" style="margin-bottom:12px;">
        Open <a href="https://${PLATFORM_HOSTS[0]}/" target="_blank" rel="noopener noreferrer">${PLATFORM_NAME}</a> to start posting images.
      </div>`;
  } else {
    html += `
      <div style="padding:12px;background:#18181b;border-radius:8px;margin-bottom:12px;font-size:12px;color:#a1a1aa;">
        You can post images from the <a href="${SERVER}/publish" target="_blank" style="color:#a78bfa;text-decoration:none;">Opalite dashboard</a> or schedule posts to be published automatically.
      </div>`;
  }

  html += `
      <div class="actions">
        <a href="${SERVER}/publish" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
          Open Publish Page
        </a>
        <a href="${SERVER}/dashboard" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
          Open Dashboard
        </a>
        <button id="signout-btn" class="btn btn-danger">Sign Out</button>
      </div>
    </div>`;

  show(html);

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await clearStorage([STORAGE_JWT_KEY, STORAGE_USER_KEY, 'opalite_refresh_token']);
    init();
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
