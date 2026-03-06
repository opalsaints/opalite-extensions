import { setupAuthCallback } from '@opalite/shared/callback';

export default defineContentScript({
  matches: ['https://opalitestudios.com/api/extension/auth*'],
  runAt: 'document_idle',
  allFrames: false,
  main() {
    setupAuthCallback({
      extensionType: 'chatgpt',
      siteUrl: 'https://chatgpt.com',
      siteName: 'chatgpt.com',
      server: 'https://opalitestudios.com',
    });
  },
});
