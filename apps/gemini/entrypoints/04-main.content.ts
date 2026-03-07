import { setupContentLoader } from '@opalite/shared/content-loader';
import { setupUpsellListener } from '@opalite/shared/upsell';

export default defineContentScript({
  matches: [
    'https://gemini.google.com/*',
    'https://labs.google/*',
  ],
  runAt: 'document_start',
  allFrames: false,
  main() {
    setupContentLoader({
      appName: 'AutoGemini',
      xorKey: 'gm',
      sourceId: 'opalite',
      shouldSkip() {
        // Skip labs.google pages that aren't the fx/flow tool
        return (
          location.host.includes('labs.google') &&
          !(location.pathname.startsWith('/fx') && location.pathname.includes('/tools/flow'))
        );
      },
    });
    setupUpsellListener('https://opalitestudios.com');
  },
});
