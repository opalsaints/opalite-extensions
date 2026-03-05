/* Opalite Popup — Grok Extension */
const SERVER = 'https://opalitestudios.com';
const PLATFORM_HOSTS = ['grok.com'];
const PLATFORM_NAME = 'Grok';
const PLATFORM_URL = 'https://grok.com/';
const EXTENSION_TYPE = 'grok';

const STORAGE_JWT_KEY = 'opalite_jwt';
const STORAGE_USER_KEY = 'opalite_user';

const $loading = document.getElementById('loading');
const $main = document.getElementById('main-content');

/* ── Safe DOM helpers ──────────────────────────── */
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function(k) {
      if (k === 'text') { node.textContent = attrs[k]; }
      else if (k === 'className') { node.className = attrs[k]; }
      else if (k === 'style') { node.style.cssText = attrs[k]; }
      else if (k === 'title') { node.title = attrs[k]; }
      else { node.setAttribute(k, attrs[k]); }
    });
  }
  if (children) {
    children.forEach(function(c) { if (c) node.appendChild(c); });
  }
  return node;
}

function link(cls, href, text, attrs) {
  var a = el('a', Object.assign({ className: cls, href: href, target: '_blank', rel: 'noopener noreferrer' }, attrs || {}));
  a.textContent = text;
  return a;
}

function svgDashboardIcon() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  ['3,3,7,7','14,3,7,7','14,14,7,7','3,14,7,7'].forEach(function(r) {
    var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    var p = r.split(',');
    rect.setAttribute('x', p[0]); rect.setAttribute('y', p[1]);
    rect.setAttribute('width', p[2]); rect.setAttribute('height', p[3]);
    svg.appendChild(rect);
  });
  return svg;
}

function show(node) {
  $loading.style.display = 'none';
  $main.style.display = 'block';
  $main.textContent = '';
  $main.appendChild(node);
}

/* ── Storage ───────────────────────────────────── */
function getStorage(key) {
  return new Promise(function(resolve) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([key], function(result) { resolve(result[key] || null); });
    } else { resolve(null); }
  });
}

function clearStorage(keys) {
  return new Promise(function(resolve) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(keys, resolve);
    } else { resolve(); }
  });
}

function decodeJwt(token) {
  try {
    var parts = token.split('.');
    if (parts.length !== 3) return null;
    var payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload);
  } catch (e) { return null; }
}

function getSocketStatus(tabId) {
  return new Promise(function(resolve) {
    if (!tabId) { resolve(false); return; }
    try {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: function() {
          try { return !!(window.__opaliteSocket && window.__opaliteSocket.isConnected()); }
          catch (e) { return false; }
        },
      }, function(results) {
        if (chrome.runtime.lastError || !results || !results[0]) { resolve(false); }
        else { resolve(results[0].result === true); }
      });
    } catch (e) { resolve(false); }
  });
}

/* S8: Read plan status from Zustand store (server-confirmed, not JWT claim) */
function getPlanStatus(tabId) {
  return new Promise(function(resolve) {
    if (!tabId) { resolve(null); return; }
    try {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: function() {
          try {
            if (!window.useOpaliteGlobal || !window.useOpaliteGlobal.getState) return null;
            var state = window.useOpaliteGlobal.getState();
            return {
              plan: state.userPlan || 'free',
              isMember: state.isMember || false,
              limits: state.planLimits || null,
              usage: state.planUsage || null,
              credits: state.planCredits || null,
              storageUsedBytes: state.storageUsedBytes || 0,
              storageQuotaBytes: state.storageQuotaBytes || 0,
            };
          } catch (e) { return null; }
        },
      }, function(results) {
        if (chrome.runtime.lastError || !results || !results[0]) { resolve(null); }
        else { resolve(results[0].result || null); }
      });
    } catch (e) { resolve(null); }
  });
}

/* ── Init ──────────────────────────────────────── */
async function init() {
  var data = await Promise.all([getStorage(STORAGE_JWT_KEY), getStorage(STORAGE_USER_KEY)]);
  var token = data[0], userJson = data[1];

  chrome.tabs.query({ active: true, currentWindow: true }, async function(tabs) {
    var tab = tabs[0];
    var url = (tab && tab.url) || '';
    var onPlatform = PLATFORM_HOSTS.some(function(h) { return url.includes(h); });

    if (!token) {
      showLoggedOut();
    } else {
      var claims = decodeJwt(token);
      var user = userJson ? (typeof userJson === 'string' ? JSON.parse(userJson) : userJson) : null;
      var socketConnected = false;
      var planStatus = null;
      if (onPlatform && tab && tab.id) {
        var results = await Promise.all([getSocketStatus(tab.id), getPlanStatus(tab.id)]);
        socketConnected = results[0];
        planStatus = results[1];
      }
      showLoggedIn(user, claims, onPlatform, socketConnected, planStatus);
    }
  });
}

/* ── Views ─────────────────────────────────────── */
function showLoggedOut() {
  var content = el('div', { className: 'content' }, [
    el('div', { className: 'status-row' }, [
      el('span', { className: 'status-dot offline' }),
      el('span', { className: 'status-text', text: 'Not signed in' }),
    ]),
    el('div', { className: 'actions' }, [
      link('btn btn-primary', SERVER + '/api/extension/auth?type=' + EXTENSION_TYPE, 'Sign in to Opalite'),
      link('btn btn-secondary', PLATFORM_URL, 'Open ' + PLATFORM_NAME),
    ]),
  ]);
  show(content);
}

function showLoggedIn(user, claims, onPlatform, socketConnected, planStatus) {
  var name = (user && user.name) || (claims && claims.name) || 'User';
  var email = (claims && claims.email) || (user && user.email) || '';
  // S8: Prefer server-confirmed plan from Zustand, fall back to JWT claim
  var plan = (planStatus && planStatus.plan) || (claims && claims.plan) || 'free';
  var initial = name.charAt(0).toUpperCase();

  var statusDot, statusLabel;
  if (socketConnected) { statusDot = 'online'; statusLabel = 'Connected'; }
  else if (onPlatform) { statusDot = 'warning'; statusLabel = 'Connecting...'; }
  else { statusDot = 'idle'; statusLabel = 'Signed in'; }

  // Dashboard icon link (top-right)
  var dashIcon = el('a', {
    className: 'dashboard-link',
    href: SERVER + '/app',
    target: '_blank',
    rel: 'noopener noreferrer',
    title: 'Open Dashboard',
  }, [svgDashboardIcon()]);

  // Plan badge styling based on plan tier
  var planLabel = plan === 'pro' ? 'Pro' : (plan === 'plus' || plan === 'starter') ? 'Plus' : 'Free';
  var planBadgeClass = 'plan-badge' + (plan !== 'free' ? ' plan-paid' : '');

  // User info children
  var userInfoKids = [
    el('div', { className: 'user-name', text: name }),
  ];
  if (email) { userInfoKids.push(el('div', { className: 'user-email', text: email })); }
  userInfoKids.push(el('span', { className: planBadgeClass, text: planLabel }));

  // Build content children
  var contentKids = [
    el('div', { className: 'top-row' }, [
      el('div', { className: 'status-row' }, [
        el('span', { className: 'status-dot ' + statusDot }),
        el('span', { className: 'status-text', text: statusLabel }),
      ]),
      dashIcon,
    ]),
    el('div', { className: 'user-info' }, [
      el('div', { className: 'avatar', text: initial }),
      el('div', null, userInfoKids),
    ]),
  ];

  // S8: Usage bar for free users with known usage data
  if (plan === 'free' && planStatus && planStatus.usage && planStatus.limits) {
    var used = planStatus.usage.download || 0;
    var limit = planStatus.limits.downloadsPerMonth;
    if (limit && limit !== Infinity) {
      var pct = Math.min(Math.round((used / limit) * 100), 100);
      var barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#eab308' : '#22c55e';
      contentKids.push(el('div', { className: 'usage-section' }, [
        el('div', { className: 'usage-label', text: 'Downloads: ' + used + ' / ' + limit + ' this month' }),
        el('div', { className: 'usage-bar' }, [
          el('div', { className: 'usage-fill', style: 'width:' + pct + '%;background:' + barColor }),
        ]),
      ]));
    }
  }

  // Credit usage for paid plans
  if (plan !== 'free' && planStatus && planStatus.credits) {
    var creditsUsed = planStatus.credits.used || 0;
    var creditsPerMonth = (planStatus.limits && planStatus.limits.creditsPerMonth) || 0;
    var creditBalance = planStatus.credits.balance || 0;
    if (creditsPerMonth > 0) {
      var creditPct = Math.min(Math.round((creditsUsed / creditsPerMonth) * 100), 100);
      var creditBarColor = creditPct >= 90 ? '#ef4444' : creditPct >= 70 ? '#eab308' : '#22c55e';
      contentKids.push(el('div', { className: 'usage-section' }, [
        el('div', { className: 'usage-label', text: '\uD83D\uDC8E Credits: ' + creditsUsed + ' / ' + creditsPerMonth + ' used this month' }),
        el('div', { className: 'usage-bar' }, [
          el('div', { className: 'usage-fill', style: 'width:' + creditPct + '%;background:' + creditBarColor }),
        ]),
      ]));
      if (creditBalance > 0) {
        contentKids.push(el('div', { className: 'usage-section' }, [
          el('div', { className: 'usage-label', text: '\uD83D\uDC8E Purchased credits: ' + creditBalance }),
        ]));
      }
    }
  }

  // Credit balance for free users (welcome gift)
  if (plan === 'free' && planStatus && planStatus.credits && planStatus.credits.balance > 0) {
    contentKids.push(el('div', { className: 'usage-section' }, [
      el('div', { className: 'usage-label', text: '\uD83D\uDC8E Credits: ' + planStatus.credits.balance }),
    ]));
  }

  // Actions
  var actionKids = [link('btn btn-primary', PLATFORM_URL, 'Open ' + PLATFORM_NAME)];
  if (plan === 'free' || plan === 'plus' || plan === 'starter') {
    actionKids.push(link('btn btn-secondary', SERVER + '/billing', plan === 'free' ? 'Upgrade Plan' : 'Manage Plan'));
  }
  contentKids.push(el('div', { className: 'actions' }, actionKids));

  var content = el('div', { className: 'content' }, contentKids);
  show(content);
}

init();
