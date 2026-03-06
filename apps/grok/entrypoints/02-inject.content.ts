import { setupStorageBridge } from '@opalite/shared/inject';

export default defineContentScript({
  matches: ['https://grok.com/*'],
  runAt: 'document_start',
  allFrames: false,
  main() {
    setupStorageBridge();
  },
});
