import { setupAuthCallback } from '@opalite/shared/callback';

export default defineContentScript({
  matches: ['https://opalitestudios.com/api/extension/auth*'],
  runAt: 'document_idle',
  allFrames: false,
  main() {
    setupAuthCallback({
      extensionType: 'gemini',
      siteUrl: 'https://gemini.google.com',
      siteName: 'gemini.google.com',
      server: 'https://opalitestudios.com',
    });
  },
});
