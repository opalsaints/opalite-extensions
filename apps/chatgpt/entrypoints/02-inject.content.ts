import { setupStorageBridge } from '@opalite/shared/inject';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://sora.chatgpt.com/*'],
  runAt: 'document_start',
  allFrames: false,
  main() {
    setupStorageBridge();
  },
});
