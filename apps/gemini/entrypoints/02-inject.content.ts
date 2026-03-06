import { setupStorageBridge } from '@opalite/shared/inject';

export default defineContentScript({
  matches: [
    'https://gemini.google.com/*',
    'https://aistudio.google.com/*',
    'https://labs.google/*',
  ],
  runAt: 'document_start',
  allFrames: false,
  main() {
    setupStorageBridge();
  },
});
