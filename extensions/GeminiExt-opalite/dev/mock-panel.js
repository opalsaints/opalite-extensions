/**
 * Opalite GeminiExt — Mock Panel for Dev Iteration
 *
 * Creates a DOM structure that mirrors the real extension panel,
 * using the same class names so style.css applies correctly.
 * This lets you iterate on CSS without loading Chrome extensions.
 *
 * NOTE: This file is a development tool only — never served to users.
 * All content is hardcoded developer-authored markup, not user input.
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  var panelVisible = false;
  var darkMode = false;
  var currentSection = 'main';

  // ── Helper: safely create element with classes and attributes ──────────
  function el(tag, classNames, attrs) {
    var e = document.createElement(tag);
    if (classNames) e.className = classNames;
    if (attrs) {
      Object.keys(attrs).forEach(function(k) {
        if (k === 'text') e.textContent = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k === 'style') e.style.cssText = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    return e;
  }

  function appendChildren(parent, children) {
    children.forEach(function(child) {
      if (child) parent.appendChild(child);
    });
  }

  // ── Shadow DOM wrapper (mirrors real structure) ────────────────────────
  var inner = el('div', 'opalite-inner');
  document.body.appendChild(inner);

  // ── Root Element ───────────────────────────────────────────────────────
  var root = el('div', 'auto-midjourney-root');
  inner.appendChild(root);

  // ── Portal Container (mirrors shadow root structure) ──────────────────
  var portalContainer = el('div', null, { id: 'opalite-portal-container' });
  inner.appendChild(portalContainer);

  // ── Trigger Button (floating) ──────────────────────────────────────────
  var trigger = el('div', 'auto-midjourney-trigger', {
    style: 'display:flex; align-items:center; gap:8px; padding:8px 16px; cursor:pointer;'
  });
  var triggerDot = el('span', null, {
    html: '<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="#f97316" opacity="0.9"/><circle cx="9" cy="9" r="4" fill="#fff" opacity="0.4"/></svg>'
  });
  var triggerLabel = el('span', null, { text: 'Opalite', style: 'font-size:13px; font-weight:600; letter-spacing:-0.2px;' });
  appendChildren(trigger, [triggerDot, triggerLabel]);
  trigger.addEventListener('click', function() { window.togglePanel(); });
  root.appendChild(trigger);

  // ── Main Container ─────────────────────────────────────────────────────
  var container = el('div', 'auto-midjourney-container auto-midjourney-hidden', {
    style: 'display:flex; flex-direction:column; height:100%;'
  });
  root.appendChild(container);

  // ══════════════════════════════════════════════════════════════════════
  //  HEADER
  // ══════════════════════════════════════════════════════════════════════
  var header = el('div', 'auto-midjourney-header', {
    style: 'display:flex; align-items:center; justify-content:space-between; padding:12px 16px;'
  });

  var title = el('h1', 'auto-midjourney-title', {
    style: 'margin:0; display:flex; align-items:center; gap:8px;'
  });
  var titleIcon = el('span', null, {
    html: '<svg width="20" height="20" viewBox="0 0 20 20"><defs><linearGradient id="og" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f43f5e"/><stop offset="50%" stop-color="#f97316"/><stop offset="100%" stop-color="#eab308"/></linearGradient></defs><circle cx="10" cy="10" r="8" fill="url(#og)"/><circle cx="10" cy="10" r="4" fill="#fff" opacity="0.3"/></svg>'
  });
  var titleText = el('span', 'auto-midjourney-header-title', { text: 'Opalite' });
  var titleVersion = el('span', null, { text: 'v2.0', style: 'font-size:10px; opacity:0.4; font-weight:400;' });
  appendChildren(title, [titleIcon, titleText, titleVersion]);

  var links = el('ul', 'auto-midjourney-links', {
    style: 'list-style:none; margin:0; padding:0; display:flex; gap:8px; align-items:center;'
  });

  // Opalite connected badge
  var badgeLi = el('li', 'opalite-header-status');
  var badge = el('div', 'opalite-header-badge');
  var badgeDot = el('span', 'opalite-header-dot opalite-dot-green', {
    style: 'width:6px; height:6px; display:inline-block;'
  });
  var badgeText = el('span', null, { text: 'Connected', style: 'font-size:11px;' });
  appendChildren(badge, [badgeDot, badgeText]);
  badgeLi.appendChild(badge);

  // Icon buttons
  var displayLi = el('li', null, {
    style: 'cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:all 0.2s;',
    title: 'Display mode',
    html: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="8" y1="2" x2="8" y2="14"/></svg>'
  });
  var settingsLi = el('li', null, {
    style: 'cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:all 0.2s;',
    title: 'Settings',
    html: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4"/></svg>'
  });
  settingsLi.addEventListener('click', function() { window.showSection('settings'); });

  var closeLi = el('li', 'auto-midjourney-header-close', {
    style: 'cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:all 0.2s;',
    title: 'Close',
    html: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>'
  });
  closeLi.addEventListener('click', function() { window.togglePanel(); });

  appendChildren(links, [badgeLi, displayLi, settingsLi, closeLi]);
  appendChildren(header, [title, links]);
  container.appendChild(header);

  // ══════════════════════════════════════════════════════════════════════
  //  BODY (Tab Content Area)
  // ══════════════════════════════════════════════════════════════════════
  var body = el('div', 'auto-midjourney-body', { style: 'flex:1; overflow-y:auto; padding:0;' });

  // ── Tab Navigation ─────────────────────────────────────────────────────
  var tabpanel = el('div', 'auto-midjourney-tabpanel');
  var tabsWrapper = el('div', 'auto-midjourney-tabs-wrapper', { style: 'padding:0 16px;' });
  var tabsUl = el('ul', 'auto-midjourney-tabs', {
    style: 'list-style:none; margin:0; padding:0; display:flex; gap:4px;'
  });

  ['Prompt', 'Describe', 'Blend', 'Select'].forEach(function(name, i) {
    var li = el('li', i === 0 ? 'auto-midjourney-tab-selected' : '', {
      style: 'padding:8px 14px; cursor:pointer; font-size:13px; border-radius:8px; transition:all 0.2s;',
      text: name
    });
    li.addEventListener('click', function() {
      tabsUl.querySelectorAll('li').forEach(function(t) { t.className = ''; });
      li.className = 'auto-midjourney-tab-selected';
    });
    tabsUl.appendChild(li);
  });
  tabsWrapper.appendChild(tabsUl);
  tabpanel.appendChild(tabsWrapper);

  // ── Tab Content ─────────────────────────────────────────────────────────
  var tabContent = el('div', null, { style: 'padding:16px;', id: 'tab-content-main' });

  // System Messages
  var msgInfo = el('div', 'auto-midjourney-message-system', { style: 'margin-bottom:10px;' });
  msgInfo.appendChild(el('p', null, {
    text: 'Welcome to Opalite! Your images are automatically saved to the cloud.',
    style: 'padding:10px 14px; border-radius:10px; margin:0; font-size:13px; line-height:1.5;'
  }));
  tabContent.appendChild(msgInfo);

  var msgSuccess = el('div', 'auto-midjourney-message-success', { style: 'margin-bottom:12px;' });
  msgSuccess.appendChild(el('p', null, {
    text: '3 images saved successfully to your gallery.',
    style: 'padding:10px 14px; border-radius:10px; margin:0; font-size:13px; line-height:1.5;'
  }));
  tabContent.appendChild(msgSuccess);

  // Textarea (prompt input)
  var mentionsWrapper = el('div', 'ant-mentions-affix-wrapper', { style: 'margin-bottom:12px;' });
  var textarea = el('textarea', 'rc-textarea', {
    style: 'width:100%; min-height:80px; padding:12px; box-sizing:border-box; border:1px solid #d9d9d9; border-radius:10px; resize:vertical; font-size:13px; line-height:1.5; font-family:inherit;'
  });
  textarea.setAttribute('placeholder', 'Describe the image you want to create...');
  mentionsWrapper.appendChild(textarea);
  tabContent.appendChild(mentionsWrapper);

  // Toolbar Buttons
  var toolbar = el('div', null, { style: 'display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap;' });
  var varBtn = el('button', 'auto-midjourney-toolbar-variable-button', {
    text: 'Variables',
    style: 'padding:6px 14px; border:1px solid #d9d9d9; border-radius:8px; background:white; cursor:pointer; font-size:12px; font-family:inherit;'
  });
  var promptBtn = el('button', 'auto-midjourney-toolbar-prompt-button', {
    text: 'Prompts',
    style: 'padding:6px 14px; border:1px solid #d9d9d9; border-radius:8px; background:white; cursor:pointer; font-size:12px; font-family:inherit;'
  });
  var clearBtn = el('button', 'auto-midjourney-toolbar-clear', {
    text: 'Clear',
    style: 'padding:6px 14px; border:1px solid #d9d9d9; border-radius:8px; background:transparent; cursor:pointer; font-size:12px; font-family:inherit; margin-left:auto;'
  });
  appendChildren(toolbar, [varBtn, promptBtn, clearBtn]);
  tabContent.appendChild(toolbar);

  // Components Showcase
  var components = el('div', null, { style: 'display:flex; flex-direction:column; gap:12px;' });

  // Primary + Default buttons row
  var btnRow = el('div', null, { style: 'display:flex; gap:8px;' });
  btnRow.appendChild(el('button', 'ant-btn ant-btn-primary', {
    text: 'Generate',
    style: 'padding:8px 24px; border:none; border-radius:10px; color:white; font-weight:600; cursor:pointer; font-size:13px; flex:1; font-family:inherit;'
  }));
  btnRow.appendChild(el('button', 'ant-btn ant-btn-default', {
    text: 'Cancel',
    style: 'padding:8px 20px; border:1px solid #d9d9d9; border-radius:10px; background:white; cursor:pointer; font-size:13px; font-family:inherit;'
  }));
  components.appendChild(btnRow);

  // Input field
  var input = el('input', 'ant-input', {
    style: 'padding:9px 14px; border:1px solid #d9d9d9; border-radius:10px; font-size:13px; width:100%; box-sizing:border-box; font-family:inherit;'
  });
  input.setAttribute('placeholder', 'Seed value (optional)...');
  components.appendChild(input);

  // Select dropdown
  var selectWrap = el('div', 'ant-select', { style: 'position:relative;' });
  var selector = el('div', 'ant-select-selector', {
    style: 'padding:9px 14px; border:1px solid #d9d9d9; border-radius:10px; cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:space-between;'
  });
  selector.appendChild(el('span', null, { text: 'Aspect Ratio: 16:9' }));
  selector.appendChild(el('span', null, {
    html: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 5 6 8 9 5"/></svg>',
    style: 'opacity:0.4;'
  }));
  selectWrap.appendChild(selector);
  components.appendChild(selectWrap);

  // Switch rows
  [
    { checked: true, label: 'Auto-save images', desc: 'Save to Opalite cloud' },
    { checked: false, label: 'HD Upscale', desc: 'Automatically upscale' }
  ].forEach(function(sw) {
    var row = el('div', null, { style: 'display:flex; align-items:center; justify-content:space-between; padding:6px 0;' });
    var labelWrap = el('div');
    labelWrap.appendChild(el('span', null, { text: sw.label, style: 'font-size:13px; font-weight:500; display:block;' }));
    labelWrap.appendChild(el('span', null, { text: sw.desc, style: 'font-size:11px; opacity:0.5; display:block;' }));
    var switchEl = el('div', 'ant-switch' + (sw.checked ? ' ant-switch-checked' : ''), {
      style: 'width:40px; height:22px; border-radius:11px; cursor:pointer; position:relative;' + (sw.checked ? '' : ' background:rgba(0,0,0,0.25);')
    });
    switchEl.addEventListener('click', function() { switchEl.classList.toggle('ant-switch-checked'); });
    appendChildren(row, [labelWrap, switchEl]);
    components.appendChild(row);
  });

  // Segmented Control
  var segmented = el('div', 'ant-segmented', { style: 'display:inline-flex; padding:2px; border-radius:10px; gap:2px;' });
  ['1:1', '16:9', '9:16', '4:3'].forEach(function(label, i) {
    var item = el('div', 'ant-segmented-item' + (i === 0 ? ' ant-segmented-item-selected' : ''), {
      text: label,
      style: 'padding:6px 16px; border-radius:8px; font-size:12px; cursor:pointer; transition:all 0.2s;'
    });
    item.addEventListener('click', function() {
      segmented.querySelectorAll('.ant-segmented-item').forEach(function(s) { s.classList.remove('ant-segmented-item-selected'); });
      item.classList.add('ant-segmented-item-selected');
    });
    segmented.appendChild(item);
  });
  components.appendChild(segmented);

  // Tags
  var tagsRow = el('div', null, { style: 'display:flex; gap:6px; flex-wrap:wrap;' });
  ['landscape', '4k', 'cinematic', 'detailed', 'vibrant'].forEach(function(tag) {
    tagsRow.appendChild(el('span', 'ant-tag', {
      text: tag,
      style: 'padding:3px 10px; font-size:11px; border-radius:6px; cursor:pointer;'
    }));
  });
  components.appendChild(tagsRow);

  // Image Gallery Preview (simulated)
  var gallerySection = el('div', null, { style: 'margin-top:8px;' });
  gallerySection.appendChild(el('div', null, {
    text: 'Recent Generations',
    style: 'font-size:12px; font-weight:600; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; opacity:0.5;'
  }));
  var galleryGrid = el('div', null, {
    style: 'display:grid; grid-template-columns:1fr 1fr; gap:8px;'
  });
  var colors = [
    'linear-gradient(135deg, #667eea, #764ba2)',
    'linear-gradient(135deg, #f093fb, #f5576c)',
    'linear-gradient(135deg, #4facfe, #00f2fe)',
    'linear-gradient(135deg, #43e97b, #38f9d7)'
  ];
  colors.forEach(function(bg, i) {
    var imgCard = el('div', null, {
      style: 'aspect-ratio:1; border-radius:10px; background:' + bg + '; position:relative; overflow:hidden; cursor:pointer; transition:all 0.3s ease;'
    });
    var overlay = el('div', null, {
      style: 'position:absolute; inset:0; background:linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.4)); display:flex; align-items:flex-end; padding:8px; opacity:0; transition:opacity 0.3s;'
    });
    overlay.appendChild(el('span', null, { text: 'Image ' + (i + 1), style: 'color:white; font-size:11px; font-weight:500;' }));
    imgCard.appendChild(overlay);
    imgCard.addEventListener('mouseenter', function() { overlay.style.opacity = '1'; imgCard.style.transform = 'translateY(-2px)'; });
    imgCard.addEventListener('mouseleave', function() { overlay.style.opacity = '0'; imgCard.style.transform = ''; });
    galleryGrid.appendChild(imgCard);
  });
  gallerySection.appendChild(galleryGrid);
  components.appendChild(gallerySection);

  tabContent.appendChild(components);
  tabpanel.appendChild(tabContent);
  body.appendChild(tabpanel);
  container.appendChild(body);

  // ══════════════════════════════════════════════════════════════════════
  //  FOOTER
  // ══════════════════════════════════════════════════════════════════════
  var footer = el('div', 'auto-midjourney-footer', {
    style: 'padding:10px 16px; display:flex; align-items:center; justify-content:space-between; font-size:11px;'
  });
  var footerLeft = el('div', null, { style: 'display:flex; align-items:center; gap:6px;' });
  footerLeft.appendChild(el('span', null, {
    html: '<svg width="14" height="14" viewBox="0 0 14 14"><defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f43f5e"/><stop offset="100%" stop-color="#f97316"/></linearGradient></defs><circle cx="7" cy="7" r="5" fill="url(#fg)" opacity="0.6"/></svg>'
  }));
  footerLeft.appendChild(el('span', null, { text: 'Opalite Studios', style: 'opacity:0.6;' }));
  footer.appendChild(footerLeft);

  var footerRight = el('div', null, { style: 'display:flex; gap:6px; align-items:center;' });
  // Footer icon buttons
  ['M2 3h10v8H2z M5 3V1 M9 3V1', 'M7 1v12 M1 7h12', 'M3 1h8l2 4v8H1V5z'].forEach(function(d) {
    var btn = el('button', null, {
      style: 'background:none; border:none; padding:4px; cursor:pointer; opacity:0.5; transition:opacity 0.2s; display:flex;',
      html: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2"><path d="' + d + '"/></svg>'
    });
    btn.addEventListener('mouseenter', function() { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', function() { btn.style.opacity = '0.5'; });
    footerRight.appendChild(btn);
  });
  footer.appendChild(footerRight);
  container.appendChild(footer);

  // ══════════════════════════════════════════════════════════════════════
  //  SETTINGS PANEL
  // ══════════════════════════════════════════════════════════════════════
  var settingsPanel = el('div', 'auto-midjourney-settings', { style: 'display:none; flex-direction:column; height:100%;' });

  // Settings Header
  var settingsHeader = el('div', 'auto-midjourney-settings-header', {
    style: 'display:flex; align-items:center; justify-content:space-between; padding:14px 16px;'
  });
  settingsHeader.appendChild(el('span', null, { text: 'Settings', style: 'font-weight:600; font-size:15px; letter-spacing:-0.2px;' }));
  var settingsClose = el('span', null, {
    style: 'cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:all 0.2s;',
    html: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>'
  });
  settingsClose.addEventListener('click', function() { window.showSection('main'); });
  settingsHeader.appendChild(settingsClose);
  settingsPanel.appendChild(settingsHeader);

  // Settings Body
  var settingsBody = el('div', 'auto-midjourney-settings-body', {
    style: 'padding:16px; overflow-y:auto; flex:1;'
  });

  // ── Account Section ─────────────────────────────────────────────────────
  var accountSection = el('div', 'opalite-account-section', { style: 'margin-bottom:20px;' });
  var accountRow = el('div', null, { style: 'display:flex; align-items:center; gap:12px; margin-bottom:12px;' });
  var avatar = el('div', 'opalite-avatar', { text: 'JC' });
  var accountInfo = el('div', null, { style: 'flex:1;' });
  accountInfo.appendChild(el('div', 'opalite-user-name', { text: 'Jonathan Cowley', style: 'font-weight:600; font-size:14px;' }));
  accountInfo.appendChild(el('div', 'opalite-user-email', { text: 'jonathan@opalite.com', style: 'font-size:12px; opacity:0.5;' }));
  var planBadge = el('span', 'opalite-plan-badge', { text: 'Pro' });
  appendChildren(accountRow, [avatar, accountInfo, planBadge]);
  accountSection.appendChild(accountRow);

  var acctBtnRow = el('div', null, { style: 'display:flex; gap:8px;' });
  acctBtnRow.appendChild(el('button', 'opalite-btn opalite-btn-primary', { text: 'Dashboard', style: 'flex:1; font-size:12px; padding:8px;' }));
  acctBtnRow.appendChild(el('button', 'opalite-btn opalite-btn-secondary', { text: 'Sign Out', style: 'flex:1; font-size:12px; padding:8px;' }));
  accountSection.appendChild(acctBtnRow);
  settingsBody.appendChild(accountSection);

  // ── Settings Groups ─────────────────────────────────────────────────────
  var settingsGroups = [
    {
      title: 'General',
      desc: 'Core extension settings',
      items: [
        { label: 'Auto-save images', desc: 'Automatically save generated images to Opalite cloud', control: 'switch-on' },
        { label: 'Show notifications', desc: 'Display desktop notifications for saves', control: 'switch-off' },
        { label: 'Image quality', desc: 'Default quality for saved images', control: 'select' },
        { label: 'Save location', desc: 'Cloud folder for new images', control: 'button' }
      ]
    },
    {
      title: 'Appearance',
      desc: 'Visual preferences',
      items: [
        { label: 'Dark mode', desc: 'Toggle between light and dark themes', control: 'dark-toggle' },
        { label: 'Panel position', desc: 'Where the panel docks on screen', control: 'segmented' },
        { label: 'Compact mode', desc: 'Reduce padding for more content', control: 'switch-off' }
      ]
    },
    {
      title: 'Advanced',
      desc: 'Power user settings',
      items: [
        { label: 'Rename rules', desc: 'Custom filename patterns for saved images', control: 'button' },
        { label: 'Batch processing', desc: 'Configure auto-upscale and background removal', control: 'switch-off' }
      ]
    }
  ];

  settingsGroups.forEach(function(group) {
    var groupDiv = el('div', 'auto-midjourney-settings-group', { style: 'margin-bottom:20px;' });
    groupDiv.appendChild(el('h3', 'auto-midjourney-settings-group-title', { text: group.title }));
    groupDiv.appendChild(el('span', 'auto-midjourney-settings-group-description', {
      text: group.desc, style: 'font-size:12px; display:block; margin-bottom:10px; opacity:0.5;'
    }));

    var list = el('ul', 'auto-midjourney-settings-group-list', {
      style: 'list-style:none; margin:0; padding:0;'
    });

    group.items.forEach(function(item) {
      var li = el('li', 'auto-midjourney-settings-item', {
        style: 'display:flex; align-items:center; justify-content:space-between; padding:12px; border-radius:10px; transition:all 0.2s;'
      });
      var labelDiv = el('div', 'auto-midjourney-settings-item-label');
      labelDiv.appendChild(el('strong', null, { text: item.label, style: 'font-size:13px; font-weight:500;' }));
      labelDiv.appendChild(el('em', null, { text: item.desc, style: 'display:block; font-size:11px; font-style:normal; opacity:0.5; margin-top:2px;' }));
      li.appendChild(labelDiv);

      var bodyDiv = el('div', 'auto-midjourney-settings-item-body');

      if (item.control === 'switch-on') {
        var sw = el('div', 'ant-switch ant-switch-checked', {
          style: 'width:40px; height:22px; border-radius:11px; cursor:pointer;'
        });
        sw.addEventListener('click', function() { sw.classList.toggle('ant-switch-checked'); });
        bodyDiv.appendChild(sw);
      } else if (item.control === 'switch-off') {
        var sw2 = el('div', 'ant-switch', {
          style: 'width:40px; height:22px; border-radius:11px; background:rgba(0,0,0,0.25); cursor:pointer;'
        });
        sw2.addEventListener('click', function() { sw2.classList.toggle('ant-switch-checked'); });
        bodyDiv.appendChild(sw2);
      } else if (item.control === 'select') {
        var sel = el('div', 'ant-select', { style: 'min-width:100px;' });
        sel.appendChild(el('div', 'ant-select-selector', {
          text: 'High',
          style: 'padding:5px 12px; border:1px solid #d9d9d9; border-radius:8px; font-size:12px; cursor:pointer;'
        }));
        bodyDiv.appendChild(sel);
      } else if (item.control === 'dark-toggle') {
        var toggleWrap = el('div', 'aj-dark-toggle');
        var toggleSwitch = el('div', 'aj-dark-toggle-switch', { style: 'cursor:pointer;' });
        toggleSwitch.addEventListener('click', function() { window.toggleDarkMode(); });
        toggleWrap.appendChild(toggleSwitch);
        bodyDiv.appendChild(toggleWrap);
      } else if (item.control === 'segmented') {
        var seg = el('div', 'ant-segmented', { style: 'display:inline-flex; padding:2px; border-radius:8px; gap:2px;' });
        ['Right', 'Left'].forEach(function(lbl, idx) {
          var si = el('div', 'ant-segmented-item' + (idx === 0 ? ' ant-segmented-item-selected' : ''), {
            text: lbl, style: 'padding:4px 12px; border-radius:6px; font-size:11px; cursor:pointer;'
          });
          si.addEventListener('click', function() {
            seg.querySelectorAll('.ant-segmented-item').forEach(function(s) { s.classList.remove('ant-segmented-item-selected'); });
            si.classList.add('ant-segmented-item-selected');
          });
          seg.appendChild(si);
        });
        bodyDiv.appendChild(seg);
      } else if (item.control === 'button') {
        bodyDiv.appendChild(el('button', 'ant-btn ant-btn-default', {
          text: 'Configure',
          style: 'padding:5px 14px; font-size:12px; border:1px solid #d9d9d9; border-radius:8px; cursor:pointer; font-family:inherit;'
        }));
      }

      li.appendChild(bodyDiv);
      list.appendChild(li);
    });

    groupDiv.appendChild(list);
    settingsBody.appendChild(groupDiv);
  });

  settingsPanel.appendChild(settingsBody);
  container.appendChild(settingsPanel);

  // ══════════════════════════════════════════════════════════════════════
  //  SIDEBAR
  // ══════════════════════════════════════════════════════════════════════
  var sidebarPanel = el('div', 'auto-midjourney-sidebar', {
    style: 'display:none; flex-direction:column; height:100%;'
  });

  var sidebarHeader = el('div', 'auto-midjourney-sidebar-controls', { style: 'padding:14px 16px; display:flex; align-items:center; justify-content:space-between;' });
  sidebarHeader.appendChild(el('span', null, { text: 'Extensions', style: 'font-weight:600; font-size:15px; letter-spacing:-0.2px;' }));
  var sidebarClose = el('span', null, {
    style: 'cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:8px;',
    html: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>'
  });
  sidebarClose.addEventListener('click', function() { window.showSection('main'); });
  sidebarHeader.appendChild(sidebarClose);
  sidebarPanel.appendChild(sidebarHeader);

  var sidebarFeatures = el('div', 'auto-midjourney-sidebar-features', { style: 'padding:0 12px; flex:1;' });
  [
    { name: 'Image Gallery', icon: 'M2 3h10v8H2z M4 11V9l2-2 2 2 3-3 1 1' },
    { name: 'Prompt Library', icon: 'M2 2h10v10H2z M5 5h4 M5 7h4 M5 9h2' },
    { name: 'Style Presets', icon: 'M7 1l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z' },
    { name: 'Batch Download', icon: 'M7 1v8 M4 6l3 3 3-3 M2 11h10' }
  ].forEach(function(feat) {
    var item = el('div', 'auto-midjourney-sidebar-feature-item', {
      style: 'padding:10px 14px; border-radius:10px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:10px; transition:all 0.2s;'
    });
    item.appendChild(el('span', null, {
      html: '<svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2"><path d="' + feat.icon + '"/></svg>',
      style: 'opacity:0.5; display:flex;'
    }));
    item.appendChild(el('span', null, { text: feat.name }));
    sidebarFeatures.appendChild(item);
  });
  sidebarPanel.appendChild(sidebarFeatures);

  var sidebarInfos = el('div', 'auto-midjourney-sidebar-infos', { style: 'padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06);' });
  var serverInfo = el('div', 'auto-midjourney-sidebar-info-item', { style: 'font-size:11px; opacity:0.5; margin-bottom:6px; display:flex; align-items:center; gap:6px;' });
  serverInfo.appendChild(document.createTextNode('Server'));
  serverInfo.appendChild(el('span', 'opalite-status-dot opalite-dot-green', {
    style: 'width:6px; height:6px; display:inline-block; border-radius:50%;'
  }));
  serverInfo.appendChild(document.createTextNode('Connected'));
  sidebarInfos.appendChild(serverInfo);

  var storageInfo = el('div', 'auto-midjourney-sidebar-info-item', { style: 'font-size:11px; opacity:0.5; display:flex; align-items:center; gap:6px;' });
  storageInfo.appendChild(document.createTextNode('Storage: 2.4 GB / 50 GB'));
  sidebarInfos.appendChild(storageInfo);

  sidebarPanel.appendChild(sidebarInfos);
  container.appendChild(sidebarPanel);

  // ══════════════════════════════════════════════════════════════════════
  //  PORTAL-RENDERED MODAL (Task Manager)
  // ══════════════════════════════════════════════════════════════════════
  var modalOverlay = el('div', null, { id: 'portal-modal-demo', style: 'display:none;' });

  var mask = el('div', 'ant-modal-mask', {
    style: 'position:fixed; inset:0; z-index:1000;'
  });
  modalOverlay.appendChild(mask);

  var modalWrap = el('div', 'auto-midjourney-tsm-modal', {
    style: 'position:fixed; inset:0; z-index:1001; display:flex; align-items:center; justify-content:center;'
  });

  var modalContent = el('div', 'ant-modal-content', {
    style: 'width:620px; max-height:80vh; overflow:hidden; position:relative;'
  });

  var modalHeader = el('div', 'ant-modal-header', { style: 'padding:16px 24px;' });
  var modalTitleRow = el('div', null, { style: 'display:flex; align-items:center; justify-content:space-between;' });
  modalTitleRow.appendChild(el('div', 'ant-modal-title', { text: 'Task Manager', style: 'font-weight:600; font-size:16px;' }));
  var modalCloseX = el('span', 'ant-modal-close', {
    style: 'cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:8px;',
    html: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>'
  });
  modalCloseX.addEventListener('click', function() { window.showSection('main'); });
  modalTitleRow.appendChild(modalCloseX);
  modalHeader.appendChild(modalTitleRow);
  modalContent.appendChild(modalHeader);

  var modalBody = el('div', 'ant-modal-body', { style: 'padding:0 24px 24px;' });

  // Segmented control for Single/Grouped
  var modalSeg = el('div', 'ant-segmented', { style: 'display:inline-flex; padding:2px; border-radius:8px; gap:2px; margin-bottom:16px;' });
  ['Single', 'Grouped'].forEach(function(lbl, i) {
    modalSeg.appendChild(el('div', 'ant-segmented-item' + (i === 0 ? ' ant-segmented-item-selected' : ''), {
      text: lbl, style: 'padding:6px 16px; border-radius:6px; font-size:12px; cursor:pointer;'
    }));
  });
  modalBody.appendChild(modalSeg);

  // Task Table
  var tableWrap = el('div', null, { style: 'border-radius:10px; overflow:hidden;' });
  var table = el('table', 'ant-table', { style: 'width:100%; border-collapse:collapse; font-size:13px;' });

  var thead = el('thead', 'ant-table-thead');
  var headRow = el('tr');
  ['', 'Task', 'Status', 'Actions'].forEach(function(h, i) {
    var th = el('th', 'ant-table-cell', {
      text: h,
      style: 'text-align:left; padding:10px 12px; font-weight:500; font-size:12px;' + (i === 0 ? 'width:32px;' : '')
    });
    if (i === 0) {
      th.innerHTML = '<div class="ant-checkbox"><span class="ant-checkbox-inner" style="width:16px;height:16px;border:1px solid #d9d9d9;border-radius:4px;display:inline-block;"></span></div>';
    }
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  var tbody = el('tbody', 'ant-table-tbody');

  var tasks = [
    { name: 'Generate landscape — sunset mountains', status: 'Running', statusColor: '#22c55e' },
    { name: 'Upscale portrait — studio lighting', status: 'Queued', statusColor: '#f59e0b' },
    { name: 'Remove background — product shot', status: 'Complete', statusColor: '#3b82f6' }
  ];

  tasks.forEach(function(task) {
    var row = el('tr');
    // Checkbox
    var cbTd = el('td', 'ant-table-cell', { style: 'padding:10px 12px;' });
    cbTd.innerHTML = '<div class="ant-checkbox"><span class="ant-checkbox-inner" style="width:16px;height:16px;border:1px solid #d9d9d9;border-radius:4px;display:inline-block;"></span></div>';
    row.appendChild(cbTd);
    // Task name
    row.appendChild(el('td', 'ant-table-cell', { text: task.name, style: 'padding:10px 12px;' }));
    // Status tag
    var statusTd = el('td', 'ant-table-cell', { style: 'padding:10px 12px;' });
    statusTd.appendChild(el('span', 'ant-tag', {
      text: task.status,
      style: 'padding:2px 10px; font-size:11px; border-radius:6px; border:1px solid ' + task.statusColor + '30; color:' + task.statusColor + '; background:' + task.statusColor + '15;'
    }));
    row.appendChild(statusTd);
    // Action
    var actionTd = el('td', 'ant-table-cell', { style: 'padding:10px 12px;' });
    actionTd.appendChild(el('button', 'ant-btn ant-btn-default', {
      text: task.status === 'Running' ? 'Pause' : task.status === 'Queued' ? 'Cancel' : 'View',
      style: 'padding:3px 14px; font-size:11px; border:1px solid #d9d9d9; border-radius:6px; cursor:pointer; font-family:inherit;'
    }));
    row.appendChild(actionTd);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  modalBody.appendChild(tableWrap);
  modalContent.appendChild(modalBody);

  var modalFooter = el('div', null, {
    style: 'padding:12px 24px; display:flex; justify-content:space-between; align-items:center;'
  });
  modalFooter.appendChild(el('span', null, { text: '3 tasks total', style: 'font-size:12px; opacity:0.5;' }));
  var modalBtnRow = el('div', null, { style: 'display:flex; gap:8px;' });
  var closeModalBtn = el('button', 'ant-btn ant-btn-default', {
    text: 'Close', style: 'padding:6px 16px; border:1px solid #d9d9d9; border-radius:8px; cursor:pointer; font-size:13px; font-family:inherit;'
  });
  closeModalBtn.addEventListener('click', function() { window.showSection('main'); });
  modalBtnRow.appendChild(closeModalBtn);
  modalBtnRow.appendChild(el('button', 'ant-btn ant-btn-primary', {
    text: 'Clear All', style: 'padding:6px 16px; border:none; border-radius:8px; cursor:pointer; font-size:13px; color:white; font-family:inherit;'
  }));
  modalFooter.appendChild(modalBtnRow);
  modalContent.appendChild(modalFooter);

  modalWrap.appendChild(modalContent);
  modalOverlay.appendChild(modalWrap);
  portalContainer.appendChild(modalOverlay);

  // ══════════════════════════════════════════════════════════════════════
  //  OPALITE HEADER WIDGET POPOVER (portal)
  // ══════════════════════════════════════════════════════════════════════
  var popoverWrap = el('div', 'opalite-hw-popover', { style: 'display:none;' });
  var popover = el('div', 'ant-popover', { style: 'position:fixed; top:60px; right:380px; z-index:1050;' });
  var popoverInner = el('div', 'ant-popover-inner', { style: 'min-width:260px;' });

  popoverInner.appendChild(el('div', 'opalite-hw-gradient-bar'));

  var popBody = el('div', 'opalite-hw-body');

  var userRow = el('div', 'opalite-hw-user-row');
  userRow.appendChild(el('div', 'opalite-avatar', { text: 'JC', style: 'width:36px; height:36px; font-size:14px;' }));
  var userInfo = el('div');
  userInfo.appendChild(el('div', null, { text: 'Jonathan Cowley', style: 'font-weight:600; font-size:13px;' }));
  var planRow = el('div', null, { style: 'display:flex; align-items:center; gap:6px;' });
  planRow.appendChild(el('span', 'opalite-plan-badge', { text: 'Pro', style: 'font-size:9px; padding:1px 6px;' }));
  planRow.appendChild(el('span', null, { text: '247 images saved', style: 'font-size:11px; opacity:0.5;' }));
  userInfo.appendChild(planRow);
  userRow.appendChild(userInfo);
  popBody.appendChild(userRow);

  var popBtnRow = el('div', 'opalite-hw-btn-row');
  popBtnRow.appendChild(el('button', 'opalite-btn opalite-btn-primary', { text: 'Dashboard', style: 'flex:1; font-size:11px; padding:7px;' }));
  popBtnRow.appendChild(el('button', 'opalite-btn opalite-btn-glass', { text: 'Settings', style: 'flex:1; font-size:11px; padding:7px;' }));
  popBody.appendChild(popBtnRow);

  var popFooter = el('div', 'opalite-hw-footer');
  ['Help', 'Feedback', 'Sign Out'].forEach(function(link, i) {
    if (i > 0) popFooter.appendChild(el('span', null, { text: '\u00B7', style: 'opacity:0.2; margin:0 2px;' }));
    popFooter.appendChild(el('span', 'opalite-hw-footer-link', { text: link, style: 'cursor:pointer;' }));
  });
  popBody.appendChild(popFooter);
  popoverInner.appendChild(popBody);
  popover.appendChild(popoverInner);
  popoverWrap.appendChild(popover);
  portalContainer.appendChild(popoverWrap);

  // ══════════════════════════════════════════════════════════════════════
  //  CONTROL FUNCTIONS (exposed to toolbar)
  // ══════════════════════════════════════════════════════════════════════

  window.togglePanel = function () {
    panelVisible = !panelVisible;
    container.classList.toggle('auto-midjourney-hidden', !panelVisible);
    trigger.style.display = panelVisible ? 'none' : 'flex';
    document.getElementById('btn-panel').textContent = panelVisible ? 'Hide' : 'Show';
    document.getElementById('btn-panel').classList.toggle('active', panelVisible);
    if (panelVisible) {
      popoverWrap.style.display = 'block';
      setTimeout(function() { popoverWrap.style.display = 'none'; }, 4000);
    }
  };

  window.toggleDarkMode = function () {
    darkMode = !darkMode;
    root.classList.toggle('dark', darkMode);
    inner.classList.toggle('dark', darkMode);
    document.body.classList.toggle('dark-page', darkMode);

    var btn = document.getElementById('btn-dark');
    btn.textContent = darkMode ? 'Dark' : 'Light';
    btn.classList.toggle('active', darkMode);

    var toggleSwitch = container.querySelector('.aj-dark-toggle-switch');
    if (toggleSwitch) toggleSwitch.classList.toggle('active', darkMode);
  };

  window.showSection = function (section) {
    currentSection = section;

    document.querySelectorAll('#dev-toolbar [data-section]').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.section === section);
    });

    var mainContent = document.getElementById('tab-content-main');
    var tabWrapper = container.querySelector('.auto-midjourney-tabs-wrapper');
    if (mainContent) mainContent.style.display = section === 'main' ? '' : 'none';
    if (tabWrapper) tabWrapper.style.display = (section === 'main' || section === 'modals') ? '' : 'none';
    settingsPanel.style.display = section === 'settings' ? 'flex' : 'none';
    sidebarPanel.style.display = section === 'sidebar' ? 'flex' : 'none';
    modalOverlay.style.display = section === 'modals' ? '' : 'none';

    body.style.display = (section === 'settings' || section === 'sidebar') ? 'none' : '';
    footer.style.display = (section === 'settings' || section === 'sidebar') ? 'none' : '';

    if (section === 'modals') {
      popoverWrap.style.display = 'none';
    }

    if (!panelVisible) window.togglePanel();
  };

  window.setPosition = function (pos) {
    document.querySelectorAll('#dev-toolbar [data-pos]').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.pos === pos);
    });
    if (pos === 'full') {
      container.classList.add('auto-midjourney-container-zoom');
    } else {
      container.classList.remove('auto-midjourney-container-zoom');
    }
  };

  // Auto-show panel on load
  setTimeout(function() { window.togglePanel(); }, 400);

})();
