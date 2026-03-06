import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  outDir: '.output',
  manifest: {
    name: 'DeviantArt Automator',
    description: 'Bulk automation tools for DeviantArt — schedule, tier, and edit operations',
    version: '2.0.0',
    permissions: ['storage', 'tabs', 'activeTab'],
    host_permissions: [
      'https://*.deviantart.com/*',
      'https://sta.sh/*',
    ],
    icons: {
      '16': 'icons/icon-16.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    action: {
      default_title: 'DeviantArt Automator',
      default_icon: {
        '16': 'icons/icon-16.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      },
    },
  },
});
