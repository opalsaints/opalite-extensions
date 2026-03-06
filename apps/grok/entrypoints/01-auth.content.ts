import { setupOpaliteAuth } from '@opalite/shared/auth';

export default defineContentScript({
  matches: ['https://grok.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: false,
  main() {
    setupOpaliteAuth('https://opalitestudios.com');
  },
});
