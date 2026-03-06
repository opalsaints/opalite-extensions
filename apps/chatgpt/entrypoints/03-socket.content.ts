import { setupOpaliteSocket } from '@opalite/shared/socket';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://sora.chatgpt.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: false,
  main() {
    setupOpaliteSocket({
      extensionType: 'chatgpt',
      server: 'https://opalitestudios.com',
      appName: 'AutoGPT',
      syncInfo: {
        name: 'Opalite for ChatGPT',
        website: 'chatgpt.com',
      },
      customDownloadEvent: 'chatgpt-imagine-created',
    });
  },
});
