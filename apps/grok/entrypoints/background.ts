import { setupBackground } from '@opalite/shared/background';
import { setupDevReload } from '@opalite/shared/dev-reload';

export default defineBackground(() => {
  setupBackground({
    extensionType: 'grok',
    server: 'https://opalitestudios.com',
    allowedFetchDomains: ['grok.com', 'x.ai'],
    sourceId: 'opalite',
  });

  setupDevReload(['https://grok.com/*']);
});
