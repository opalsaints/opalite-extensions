import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  outDir: '.output',
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: [
      'downloads',
      'declarativeNetRequest',
      'storage',
      'notifications',
      'scripting',
      'activeTab',
      'cookies',
    ],
    host_permissions: [
      'https://gemini.google.com/*',
      'https://aistudio.google.com/*',
      'https://labs.google/*',
      'https://opalitestudios.com/*',
      'https://lh3.googleusercontent.com/*',
    ],
    web_accessible_resources: [
      {
        matches: [
          'https://gemini.google.com/*',
          'https://aistudio.google.com/*',
          'https://labs.google/*',
        ],
        resources: [
          'scripts/style.css',
          'scripts/compat.js',
          'scripts/main.js',
          'scripts/socket.io.min.js',
        ],
      },
    ],
    declarative_net_request: {
      rule_resources: [
        {
          id: 'ruleset_1',
          enabled: true,
          path: 'rules.json',
        },
      ],
    },
    icons: {
      '16': 'images/icon-16.png',
      '32': 'images/icon-32.png',
      '48': 'images/icon-48.png',
      '128': 'images/icon-128.png',
    },
    action: {
      default_icon: 'images/icon-128.png',
      default_title: '__MSG_extName__',
    },
  },
});
