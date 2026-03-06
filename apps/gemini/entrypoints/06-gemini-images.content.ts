import { setupGeminiImageDetector } from '@opalite/shared/gemini-images';

export default defineContentScript({
  matches: [
    'https://gemini.google.com/*',
    'https://aistudio.google.com/*',
    'https://labs.google/*',
  ],
  runAt: 'document_idle',
  world: 'MAIN',
  allFrames: false,
  main() {
    setupGeminiImageDetector();
  },
});
