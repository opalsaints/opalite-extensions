import { setupContentLoader } from '@opalite/shared/content-loader';
import { setupUpsellListener } from '@opalite/shared/upsell';

export default defineContentScript({
  matches: ['https://grok.com/*'],
  runAt: 'document_start',
  allFrames: false,
  main() {
    setupContentLoader({
      appName: 'AutoGrok',
      xorKey: 'gk',
      sourceId: 'opalite',
    });
    setupUpsellListener('https://opalitestudios.com');
  },
});
