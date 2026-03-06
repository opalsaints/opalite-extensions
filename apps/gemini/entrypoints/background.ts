import { setupBackground } from '@opalite/shared/background';

export default defineBackground(() => {
  setupBackground({
    extensionType: 'gemini',
    server: 'https://opalitestudios.com',
    allowedFetchDomains: [
      'google.com',
      'googleapis.com',
      'googleusercontent.com',
      'labs.google',
    ],
    sourceId: 'opalite',
  });

  if (import.meta.env.DEV) {
    import('@opalite/shared/dev-reload').then(({ setupDevReload }) => {
      setupDevReload([
        'https://gemini.google.com/*',
        'https://aistudio.google.com/*',
        'https://labs.google/*',
      ]);
    });
  }
});
