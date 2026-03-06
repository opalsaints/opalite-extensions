import { setupOpaliteAuth } from '@opalite/shared/auth';

export default defineContentScript({
  matches: [
    'https://gemini.google.com/*',
    'https://aistudio.google.com/*',
    'https://labs.google/*',
  ],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: false,
  main() {
    setupOpaliteAuth('https://opalitestudios.com');
  },
});
