import { initPopup } from '@opalite/shared/popup';
import '@opalite/shared/popup.css';

initPopup({
  server: 'https://opalitestudios.com',
  platformHosts: ['chatgpt.com', 'sora.chatgpt.com'],
  platformName: 'ChatGPT',
  platformUrl: 'https://chatgpt.com/',
  extensionType: 'chatgpt',
  extensionName: 'ChatGPT Suite',
  branding: {
    gradient: 'linear-gradient(135deg, #f43f5e, #f97316, #eab308)',
    badgeText: 'ChatGPT',
  },
});
