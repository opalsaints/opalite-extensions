import type { IMessagingAdapter } from './interfaces';
import type { ExtensionMessage } from '../shared/types';

type MessageHandler = (message: ExtensionMessage, respond: (data: unknown) => void, senderTabId?: number) => void;

/**
 * EventTarget-based messaging adapter for testing.
 * Simulates chrome.runtime messaging without Chrome.
 */
export class MockMessagingAdapter implements IMessagingAdapter {
  private handlers = new Set<MessageHandler>();
  private tabHandlers = new Map<number, Set<MessageHandler>>();

  async send(message: ExtensionMessage): Promise<unknown> {
    let response: unknown = undefined;
    for (const handler of this.handlers) {
      handler(message, (data) => {
        response = data;
      });
    }
    return response;
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async sendToTab(tabId: number, message: ExtensionMessage): Promise<unknown> {
    const handlers = this.tabHandlers.get(tabId);
    if (!handlers) return undefined;
    let response: unknown = undefined;
    for (const handler of handlers) {
      handler(message, (data) => {
        response = data;
      });
    }
    return response;
  }

  /** Test helper: register a handler for a specific tab */
  onMessageForTab(tabId: number, handler: MessageHandler): () => void {
    if (!this.tabHandlers.has(tabId)) {
      this.tabHandlers.set(tabId, new Set());
    }
    this.tabHandlers.get(tabId)!.add(handler);
    return () => this.tabHandlers.get(tabId)?.delete(handler);
  }
}
