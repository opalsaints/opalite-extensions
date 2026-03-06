import type { IMessagingAdapter } from './interfaces';
import type { ExtensionMessage } from '../shared/types';

/**
 * chrome.runtime messaging adapter.
 * Production implementation — wraps Chrome's message passing API.
 */
export class ChromeMessagingAdapter implements IMessagingAdapter {
  async send(message: ExtensionMessage): Promise<unknown> {
    return chrome.runtime.sendMessage(message);
  }

  onMessage(
    handler: (message: ExtensionMessage, respond: (data: unknown) => void, senderTabId?: number) => void,
  ): () => void {
    const listener = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ): boolean | undefined => {
      let calledSync = false;

      const respond = (data: unknown) => {
        calledSync = true;
        sendResponse(data);
      };

      handler(message as ExtensionMessage, respond, sender.tab?.id);

      // Only keep channel open if respond() was NOT called synchronously
      // (handler will call it asynchronously via .then())
      if (!calledSync) {
        return true;
      }
      return undefined;
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }

  async sendToTab(tabId: number, message: ExtensionMessage): Promise<unknown> {
    return chrome.tabs.sendMessage(tabId, message);
  }
}
