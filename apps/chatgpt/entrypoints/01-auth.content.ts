import { setupOpaliteAuth } from '@opalite/shared/auth';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://sora.chatgpt.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: false,
  main() {
    setupOpaliteAuth('https://opalitestudios.com');
  },
});
