import type { ITabsAdapter, TabInfo } from './interfaces';

/**
 * chrome.tabs adapter.
 * Production implementation — wraps Chrome's tabs API.
 */
export class ChromeTabsAdapter implements ITabsAdapter {
  async create(options: { url: string; active?: boolean }): Promise<{ id: number }> {
    const tab = await chrome.tabs.create(options);
    return { id: tab.id! };
  }

  async update(tabId: number, options: { url?: string; active?: boolean }): Promise<void> {
    await chrome.tabs.update(tabId, options);
  }

  async remove(tabId: number): Promise<void> {
    await chrome.tabs.remove(tabId);
  }

  async get(tabId: number): Promise<TabInfo> {
    const tab = await chrome.tabs.get(tabId);
    return {
      id: tab.id!,
      url: tab.url,
      title: tab.title,
      status: tab.status,
    };
  }

  async getCurrent(): Promise<TabInfo | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      status: tab.status,
    };
  }

  onUpdated(
    callback: (tabId: number, changeInfo: { url?: string; status?: string }) => void,
  ): () => void {
    const handler = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      callback(tabId, { url: changeInfo.url, status: changeInfo.status });
    };
    chrome.tabs.onUpdated.addListener(handler);
    return () => chrome.tabs.onUpdated.removeListener(handler);
  }

  onRemoved(callback: (tabId: number) => void): () => void {
    chrome.tabs.onRemoved.addListener(callback);
    return () => chrome.tabs.onRemoved.removeListener(callback);
  }
}
