/**
 * Opalite Popup Logic
 *
 * Handles the extension popup UI: signed-in/signed-out views,
 * socket status, plan badges, usage bars, and credits.
 *
 * Usage (in a WXT popup entrypoint):
 *   import { initPopup } from '@opalite/shared/popup';
 *   initPopup({
 *     server: 'https://opalitestudios.com',
 *     platformHosts: ['chatgpt.com'],
 *     platformName: 'ChatGPT',
 *     platformUrl: 'https://chatgpt.com/',
 *     extensionType: 'chatgpt',
 *     extensionName: 'ChatGPT Suite',
 *     branding: { gradient: 'linear-gradient(135deg, #f43f5e, #f97316, #eab308)', badgeText: 'ChatGPT' },
 *   });
 */

import type { PopupConfig, PlanStatusData } from './types';

const STORAGE_JWT_KEY = 'opalite_jwt';
const STORAGE_USER_KEY = 'opalite_user';

// ─── Safe DOM helpers ────────────────────────────────────────

function el(
  tag: string,
  attrs?: Record<string, string> | null,
  children?: (HTMLElement | null)[]
): HTMLElement {
  const node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach((k) => {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'className') node.className = attrs[k];
      else if (k === 'style') node.style.cssText = attrs[k];
      else if (k === 'title') node.title = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
  }
  if (children) {
    children.forEach((c) => {
      if (c) node.appendChild(c);
    });
  }
  return node;
}

function createLink(
  cls: string,
  href: string,
  text: string,
  extraAttrs?: Record<string, string>
): HTMLAnchorElement {
  const a = el('a', {
    className: cls,
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    ...extraAttrs,
  }) as HTMLAnchorElement;
  a.textContent = text;
  return a;
}

function svgDashboardIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  ['3,3,7,7', '14,3,7,7', '14,14,7,7', '3,14,7,7'].forEach((r) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const p = r.split(',');
    rect.setAttribute('x', p[0]);
    rect.setAttribute('y', p[1]);
    rect.setAttribute('width', p[2]);
    rect.setAttribute('height', p[3]);
    svg.appendChild(rect);
  });
  return svg;
}

// ─── Storage ─────────────────────────────────────────────────

function getStorage(key: string): Promise<unknown> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([key], (result) => resolve(result[key] || null));
    } else {
      resolve(null);
    }
  });
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function getSocketStatus(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (!tabId) {
      resolve(false);
      return;
    }
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          world: 'MAIN',
          func: () => {
            try {
              return !!(window.__opaliteSocket && window.__opaliteSocket.isConnected());
            } catch {
              return false;
            }
          },
        },
        (results) => {
          if (chrome.runtime.lastError || !results?.[0]) {
            resolve(false);
          } else {
            resolve(results[0].result === true);
          }
        }
      );
    } catch {
      resolve(false);
    }
  });
}

function getPlanStatus(tabId: number): Promise<PlanStatusData | null> {
  return new Promise((resolve) => {
    if (!tabId) {
      resolve(null);
      return;
    }
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          world: 'MAIN',
          func: () => {
            try {
              if (!window.useOpaliteGlobal?.getState) return null;
              const state = window.useOpaliteGlobal.getState();
              return {
                plan: (state.userPlan as string) || 'free',
                isMember: (state.isMember as boolean) || false,
                limits: (state.planLimits as Record<string, unknown>) || null,
                usage: (state.planUsage as Record<string, unknown>) || null,
                credits: (state.planCredits as Record<string, unknown>) || null,
                storageUsedBytes: (state.storageUsedBytes as number) || 0,
                storageQuotaBytes: (state.storageQuotaBytes as number) || 0,
              };
            } catch {
              return null;
            }
          },
        },
        (results) => {
          if (chrome.runtime.lastError || !results?.[0]) {
            resolve(null);
          } else {
            resolve(results[0].result as PlanStatusData | null);
          }
        }
      );
    } catch {
      resolve(null);
    }
  });
}

// ─── Views ───────────────────────────────────────────────────

function show(
  loadingEl: HTMLElement,
  mainEl: HTMLElement,
  node: HTMLElement
): void {
  loadingEl.style.display = 'none';
  mainEl.style.display = 'block';
  mainEl.textContent = '';
  mainEl.appendChild(node);
}

function showLoggedOut(
  config: PopupConfig,
  loadingEl: HTMLElement,
  mainEl: HTMLElement
): void {
  const content = el('div', { className: 'content' }, [
    el('div', { className: 'status-row' }, [
      el('span', { className: 'status-dot offline' }),
      el('span', { className: 'status-text', text: 'Not signed in' }),
    ]),
    el('div', { className: 'actions' }, [
      createLink(
        'btn btn-primary',
        config.server + '/api/extension/auth?type=' + config.extensionType,
        'Sign in to Opalite'
      ),
      createLink('btn btn-secondary', config.platformUrl, 'Open ' + config.platformName),
    ]),
  ]);
  show(loadingEl, mainEl, content);
}

function showLoggedIn(
  config: PopupConfig,
  loadingEl: HTMLElement,
  mainEl: HTMLElement,
  user: Record<string, unknown> | null,
  claims: Record<string, unknown> | null,
  onPlatform: boolean,
  socketConnected: boolean,
  planStatus: PlanStatusData | null
): void {
  const name =
    ((user?.name as string) || (claims?.name as string) || 'User');
  const email = ((claims?.email as string) || (user?.email as string) || '');
  const plan =
    planStatus?.plan || (claims?.plan as string) || 'free';
  const initial = name.charAt(0).toUpperCase();

  let statusDot: string, statusLabel: string;
  if (socketConnected) {
    statusDot = 'online';
    statusLabel = 'Connected';
  } else if (onPlatform) {
    statusDot = 'warning';
    statusLabel = 'Connecting...';
  } else {
    statusDot = 'idle';
    statusLabel = 'Signed in';
  }

  const dashIcon = el(
    'a',
    {
      className: 'dashboard-link',
      href: config.server + '/app',
      target: '_blank',
      rel: 'noopener noreferrer',
      title: 'Open Dashboard',
    },
    [svgDashboardIcon() as unknown as HTMLElement]
  );

  const planLabel =
    plan === 'pro' ? 'Pro' : plan === 'plus' || plan === 'starter' ? 'Plus' : 'Free';
  const planBadgeClass = 'plan-badge' + (plan !== 'free' ? ' plan-paid' : '');

  const userInfoKids: HTMLElement[] = [el('div', { className: 'user-name', text: name })];
  if (email) {
    userInfoKids.push(el('div', { className: 'user-email', text: email }));
  }
  userInfoKids.push(el('span', { className: planBadgeClass, text: planLabel }));

  const contentKids: HTMLElement[] = [
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

  // Usage bar for free users
  if (
    plan === 'free' &&
    planStatus?.usage &&
    planStatus?.limits
  ) {
    const used = (planStatus.usage as Record<string, number>).download || 0;
    const limit = (planStatus.limits as Record<string, number>).downloadsPerMonth;
    if (limit && limit !== Infinity) {
      const pct = Math.min(Math.round((used / limit) * 100), 100);
      const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#eab308' : '#22c55e';
      contentKids.push(
        el('div', { className: 'usage-section' }, [
          el('div', {
            className: 'usage-label',
            text: 'Downloads: ' + used + ' / ' + limit + ' this month',
          }),
          el('div', { className: 'usage-bar' }, [
            el('div', {
              className: 'usage-fill',
              style: 'width:' + pct + '%;background:' + barColor,
            }),
          ]),
        ])
      );
    }
  }

  // Credit usage for paid plans
  if (plan !== 'free' && planStatus?.credits) {
    const creditsUsed = (planStatus.credits as Record<string, number>).used || 0;
    const creditsPerMonth =
      (planStatus.limits as Record<string, number>)?.creditsPerMonth || 0;
    const creditBalance = (planStatus.credits as Record<string, number>).balance || 0;
    if (creditsPerMonth > 0) {
      const creditPct = Math.min(Math.round((creditsUsed / creditsPerMonth) * 100), 100);
      const creditBarColor =
        creditPct >= 90 ? '#ef4444' : creditPct >= 70 ? '#eab308' : '#22c55e';
      contentKids.push(
        el('div', { className: 'usage-section' }, [
          el('div', {
            className: 'usage-label',
            text:
              '\uD83D\uDC8E Credits: ' +
              creditsUsed +
              ' / ' +
              creditsPerMonth +
              ' used this month',
          }),
          el('div', { className: 'usage-bar' }, [
            el('div', {
              className: 'usage-fill',
              style: 'width:' + creditPct + '%;background:' + creditBarColor,
            }),
          ]),
        ])
      );
      if (creditBalance > 0) {
        contentKids.push(
          el('div', { className: 'usage-section' }, [
            el('div', {
              className: 'usage-label',
              text: '\uD83D\uDC8E Purchased credits: ' + creditBalance,
            }),
          ])
        );
      }
    }
  }

  // Credit balance for free users (welcome gift)
  if (
    plan === 'free' &&
    planStatus?.credits &&
    (planStatus.credits as Record<string, number>).balance > 0
  ) {
    contentKids.push(
      el('div', { className: 'usage-section' }, [
        el('div', {
          className: 'usage-label',
          text:
            '\uD83D\uDC8E Credits: ' +
            (planStatus.credits as Record<string, number>).balance,
        }),
      ])
    );
  }

  // Actions
  const actionKids: HTMLElement[] = [
    createLink('btn btn-primary', config.platformUrl, 'Open ' + config.platformName),
  ];
  if (plan === 'free' || plan === 'plus' || plan === 'starter') {
    actionKids.push(
      createLink(
        'btn btn-secondary',
        config.server + '/billing',
        plan === 'free' ? 'Upgrade Plan' : 'Manage Plan'
      )
    );
  }
  contentKids.push(el('div', { className: 'actions' }, actionKids));

  const content = el('div', { className: 'content' }, contentKids);
  show(loadingEl, mainEl, content);
}

// ─── Init ────────────────────────────────────────────────────

/**
 * Initialize the popup. Call from popup's main.ts after DOM is ready.
 * Expects #loading and #main-content elements in the HTML.
 */
export function initPopup(config: PopupConfig): void {
  const loadingEl = document.getElementById('loading')!;
  const mainEl = document.getElementById('main-content')!;

  Promise.all([getStorage(STORAGE_JWT_KEY), getStorage(STORAGE_USER_KEY)])
    .then(([token, userJson]) => {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        try {
          const tab = tabs[0];
          const url = tab?.url || '';
          const onPlatform = config.platformHosts.some((h) => url.includes(h));

          if (!token) {
            showLoggedOut(config, loadingEl, mainEl);
          } else {
            const claims = decodeJwt(token as string);
            const user = userJson
              ? typeof userJson === 'string'
                ? JSON.parse(userJson)
                : userJson
              : null;
            let socketConnected = false;
            let planStatus: PlanStatusData | null = null;
            if (onPlatform && tab?.id) {
              const results = await Promise.all([
                getSocketStatus(tab.id),
                getPlanStatus(tab.id),
              ]);
              socketConnected = results[0];
              planStatus = results[1];
            }
            showLoggedIn(
              config,
              loadingEl,
              mainEl,
              user,
              claims,
              onPlatform,
              socketConnected,
              planStatus
            );
          }
        } catch (err) {
          console.error('[Opalite Popup] Error:', err);
          showLoggedOut(config, loadingEl, mainEl);
        }
      });
    })
    .catch((err) => {
      console.error('[Opalite Popup] Storage error:', err);
      showLoggedOut(config, loadingEl, mainEl);
    });
}
