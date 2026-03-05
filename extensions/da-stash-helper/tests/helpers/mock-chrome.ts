/**
 * Chrome API mock factory for testing.
 * Provides minimal mock implementations of chrome.* APIs used by the extension.
 */

export function createMockChromeApi(): typeof chrome {
  const listeners = new Map<string, Set<Function>>();

  const addListener = (eventName: string) => ({
    addListener: (fn: Function) => {
      if (!listeners.has(eventName)) listeners.set(eventName, new Set());
      listeners.get(eventName)!.add(fn);
    },
    removeListener: (fn: Function) => {
      listeners.get(eventName)?.delete(fn);
    },
    hasListener: (fn: Function) => listeners.get(eventName)?.has(fn) ?? false,
  });

  const storage = new Map<string, unknown>();

  return {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const keyArr = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const key of keyArr) {
            if (storage.has(key)) result[key] = storage.get(key);
          }
          return result;
        },
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) {
            storage.set(key, value);
          }
        },
        remove: async (keys: string | string[]) => {
          const keyArr = Array.isArray(keys) ? keys : [keys];
          for (const key of keyArr) storage.delete(key);
        },
      },
      onChanged: addListener('storage.onChanged'),
    },
    runtime: {
      sendMessage: async () => {},
      onMessage: addListener('runtime.onMessage'),
      id: 'mock-extension-id',
    },
    tabs: {
      create: async (opts: any) => ({ id: 1, ...opts }),
      update: async () => ({}),
      remove: async () => {},
      get: async (id: number) => ({ id, url: 'https://www.deviantart.com/stash/', title: 'Stash', status: 'complete' }),
      getCurrent: async () => ({ id: 1, url: 'https://www.deviantart.com/stash/' }),
      onUpdated: addListener('tabs.onUpdated'),
      onRemoved: addListener('tabs.onRemoved'),
    },
    action: {
      onClicked: addListener('action.onClicked'),
    },
    sidePanel: {
      open: async () => {},
    },
  } as unknown as typeof chrome;
}

/**
 * Install the mock Chrome API globally for testing.
 */
export function installMockChrome(): typeof chrome {
  const mock = createMockChromeApi();
  (globalThis as any).chrome = mock;
  return mock;
}
