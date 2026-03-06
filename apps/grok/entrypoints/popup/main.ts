import { initPopup } from '@opalite/shared/popup';
import '@opalite/shared/popup.css';

initPopup({
  server: 'https://opalitestudios.com',
  platformHosts: ['grok.com'],
  platformName: 'Grok',
  platformUrl: 'https://grok.com/',
  extensionType: 'grok',
  extensionName: 'Grok Suite',
  branding: {
    gradient: 'linear-gradient(135deg, #f43f5e, #f97316, #eab308)',
    badgeText: 'Grok',
  },
});
