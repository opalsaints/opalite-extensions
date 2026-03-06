import { setupOpaliteSocket } from '@opalite/shared/socket';

export default defineContentScript({
  matches: ['https://grok.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: false,
  main() {
    setupOpaliteSocket({
      extensionType: 'grok',
      server: 'https://opalitestudios.com',
      appName: 'AutoGrok',
      syncInfo: {
        name: 'Opalite for Grok',
        website: 'grok.com',
      },
    });
  },
});
