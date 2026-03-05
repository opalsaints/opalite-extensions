/**
 * Opalite Upsell UI
 *
 * Listens for quota-exceeded messages from the Opalite socket layer
 * and shows an upgrade modal overlay on the AI platform page.
 *
 * Communication: The download handler in main.js posts a message
 * via window.postMessage when server returns quotaExceeded: true.
 */
(function () {
  'use strict';

  const SERVER = 'https://opalitestudios.com';
  let modalShown = false;

  function createModal(data) {
    if (modalShown) return;
    modalShown = true;

    // Security: coerce to integers to prevent any injection
    const used = parseInt(data.used, 10) || 0;
    const limit = parseInt(data.limit, 10) || 0;

    // --- Overlay ---
    const overlay = document.createElement('div');
    overlay.id = 'opalite-upsell-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // --- Card ---
    const card = document.createElement('div');
    card.style.cssText = `
      background: #18181b;
      border: 1px solid #3f3f46;
      border-radius: 16px;
      padding: 32px;
      max-width: 400px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
    `;

    // --- Icon ---
    const iconBox = document.createElement('div');
    iconBox.style.cssText = `
      width: 56px; height: 56px;
      background: linear-gradient(135deg, #7c3aed, #a855f7);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 28px;
    `;
    iconBox.textContent = '\u26A1'; // ⚡

    // --- Title ---
    const title = document.createElement('h2');
    title.style.cssText = `
      color: #e4e4e7;
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 8px;
    `;
    title.textContent = 'Monthly Limit Reached';

    // --- Description ---
    const desc = document.createElement('p');
    desc.style.cssText = `
      color: #a1a1aa;
      font-size: 14px;
      margin: 0 0 20px;
      line-height: 1.5;
    `;
    desc.appendChild(document.createTextNode("You've used "));
    const usedStrong = document.createElement('strong');
    usedStrong.style.color = '#e4e4e7';
    usedStrong.textContent = String(used);
    desc.appendChild(usedStrong);
    desc.appendChild(document.createTextNode(' of '));
    const limitStrong = document.createElement('strong');
    limitStrong.style.color = '#e4e4e7';
    limitStrong.textContent = String(limit);
    desc.appendChild(limitStrong);
    desc.appendChild(
      document.createTextNode(' downloads this month. Upgrade to continue saving images.')
    );

    // --- Progress bar ---
    const progressOuter = document.createElement('div');
    progressOuter.style.cssText = `
      background: #27272a;
      border-radius: 8px;
      height: 8px;
      margin: 0 0 24px;
      overflow: hidden;
    `;
    const progressInner = document.createElement('div');
    progressInner.style.cssText = `
      height: 100%;
      width: 100%;
      background: #ef4444;
      border-radius: 8px;
    `;
    progressOuter.appendChild(progressInner);

    // --- Upgrade link ---
    const upgradeLink = document.createElement('a');
    upgradeLink.href = SERVER + '/billing';
    upgradeLink.target = '_blank';
    upgradeLink.rel = 'noopener noreferrer';
    upgradeLink.textContent = 'Upgrade Now';
    upgradeLink.style.cssText = `
      display: block;
      background: #7c3aed;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 12px;
      transition: background 0.2s;
    `;
    upgradeLink.addEventListener('mouseover', function () {
      this.style.background = '#6d28d9';
    });
    upgradeLink.addEventListener('mouseout', function () {
      this.style.background = '#7c3aed';
    });

    // --- Dismiss button ---
    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.style.cssText = `
      background: none;
      border: none;
      color: #71717a;
      font-size: 13px;
      cursor: pointer;
      padding: 8px;
    `;

    // --- Footer ---
    const footer = document.createElement('p');
    footer.style.cssText = `
      color: #52525b;
      font-size: 11px;
      margin-top: 16px;
    `;
    footer.textContent = 'Powered by Opalite';

    // --- Assemble ---
    card.appendChild(iconBox);
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(progressOuter);
    card.appendChild(upgradeLink);
    card.appendChild(dismissBtn);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // --- Event listeners ---
    function closeModal() {
      overlay.remove();
      modalShown = false;
    }

    dismissBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
  }

  // Listen for quota exceeded messages from the extension's socket layer
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'OPALITE_QUOTA_EXCEEDED') return;

    createModal(event.data);
  });
})();
