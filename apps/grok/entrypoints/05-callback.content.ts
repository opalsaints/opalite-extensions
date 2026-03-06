import { setupAuthCallback } from '@opalite/shared/callback';

export default defineContentScript({
  matches: ['https://opalitestudios.com/api/extension/auth*'],
  runAt: 'document_idle',
  allFrames: false,
  main() {
    setupAuthCallback({
      extensionType: 'grok',
      siteUrl: 'https://grok.com',
      siteName: 'grok.com',
      server: 'https://opalitestudios.com',
    });
  },
});
