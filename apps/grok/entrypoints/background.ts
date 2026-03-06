import { setupBackground } from '@opalite/shared/background';

export default defineBackground(() => {
  setupBackground({
    extensionType: 'grok',
    server: 'https://opalitestudios.com',
    allowedFetchDomains: ['grok.com', 'x.ai'],
    sourceId: 'opalite',
  });

  if (import.meta.env.DEV) {
    import('@opalite/shared/dev-reload').then(({ setupDevReload }) => {
      setupDevReload(['https://grok.com/*']);
    });
  }
});
