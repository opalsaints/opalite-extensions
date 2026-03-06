import { setupBackground } from '@opalite/shared/background';

export default defineBackground(() => {
  setupBackground({
    extensionType: 'chatgpt',
    server: 'https://opalitestudios.com',
    allowedFetchDomains: [
      'chatgpt.com',
      'openai.com',
      'oaidalleapiprodscus.blob.core.windows.net',
    ],
    sourceId: 'opalite',
  });

  if (import.meta.env.DEV) {
    import('@opalite/shared/dev-reload').then(({ setupDevReload }) => {
      setupDevReload([
        'https://chatgpt.com/*',
        'https://sora.chatgpt.com/*',
      ]);
    });
  }
});
