import { setupBackground } from '@opalite/shared/background';
import { setupDevReload } from '@opalite/shared/dev-reload';

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

  setupDevReload([
    'https://gemini.google.com/*',
    'https://aistudio.google.com/*',
    'https://labs.google/*',
  ]);
});
