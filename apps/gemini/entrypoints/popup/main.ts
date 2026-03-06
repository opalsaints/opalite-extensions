import { initPopup } from '@opalite/shared/popup';
import '@opalite/shared/popup.css';

initPopup({
  server: 'https://opalitestudios.com',
  platformHosts: ['gemini.google.com'],
  platformName: 'Gemini',
  platformUrl: 'https://gemini.google.com/',
  extensionType: 'gemini',
  extensionName: 'Gemini Suite',
  branding: {
    gradient: 'linear-gradient(135deg, #f43f5e, #f97316, #eab308)',
    badgeText: 'Gemini',
  },
});
