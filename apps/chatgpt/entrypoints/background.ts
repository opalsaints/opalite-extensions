import { setupBackground } from '@opalite/shared/background';
import { setupDevReload } from '@opalite/shared/dev-reload';

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

  setupDevReload([
    'https://chatgpt.com/*',
    'https://sora.chatgpt.com/*',
  ]);
});
