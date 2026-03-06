import { setupOpaliteSocket } from '@opalite/shared/socket';

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
    setupOpaliteSocket({
      extensionType: 'gemini',
      server: 'https://opalitestudios.com',
      appName: 'AutoGemini',
      syncInfo: {
        name: 'Opalite for Gemini',
        website: 'gemini.google.com',
      },
    });
  },
});
