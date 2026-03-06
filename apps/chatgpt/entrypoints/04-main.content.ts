import { setupContentLoader } from '@opalite/shared/content-loader';
import { setupUpsellListener } from '@opalite/shared/upsell';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://sora.chatgpt.com/*'],
  runAt: 'document_start',
  allFrames: false,
  main() {
    setupContentLoader({
      appName: 'AutoGPT',
      xorKey: 'gpt',
      sourceId: 'opalite',
    });
    setupUpsellListener('https://opalitestudios.com');
  },
});
