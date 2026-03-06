/**
 * Reactive store with selector-based subscriptions.
 * Flux-like: dispatch(action) → reduce → notify subscribers.
 * Zero Chrome dependencies.
 */

import type { StashState } from './store.types';
import type { StoreAction } from './actions';

export interface IStore {
  getState(): Readonly<StashState>;
  dispatch(action: StoreAction): void;
  subscribe<T>(selector: (state: StashState) => T, callback: (value: T) => void): () => void;
}

export class Store implements IStore {
  private state: StashState;
  private subscribers: Array<{
    selector: (s: StashState) => unknown;
    callback: (value: unknown) => void;
    lastValue: unknown;
  }> = [];

  constructor(initialState: StashState) {
    this.state = initialState;
  }

  getState(): Readonly<StashState> {
    return this.state;
  }

  dispatch(action: StoreAction): void {
    this.state = reduce(this.state, action);
    this.notifySubscribers();
  }

  subscribe<T>(selector: (state: StashState) => T, callback: (value: T) => void): () => void {
    const initialValue = selector(this.state);
    const entry = {
      selector: selector as (s: StashState) => unknown,
      callback: callback as (value: unknown) => void,
      lastValue: initialValue as unknown,
    };
    this.subscribers.push(entry);

    // Deliver current value immediately (BehaviorSubject pattern).
    // This ensures late-joining subscribers always see current state.
    try {
      callback(initialValue);
    } catch (err) {
      console.error('[Store] Subscriber error on initial delivery:', err);
    }

    return () => {
      const idx = this.subscribers.indexOf(entry);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  private notifySubscribers(): void {
    for (const sub of this.subscribers) {
      const newValue = sub.selector(this.state);
      if (newValue !== sub.lastValue) {
        sub.lastValue = newValue;
        try {
          sub.callback(newValue);
        } catch (err) {
          console.error('[Store] Subscriber error:', err);
        }
      }
    }
  }
}

// ── Reducer ──

function reduce(state: StashState, action: StoreAction): StashState {
  switch (action.type) {
    case 'SET_ROUTE':
      return { ...state, currentRoute: action.route };

    case 'SET_ITEMS':
      return { ...state, items: action.items };

    case 'SET_SELECTION':
      return {
        ...state,
        selectedIds: action.selectedIds,
        items: state.items.map((item) => ({
          ...item,
          selected: action.selectedIds.includes(item.id),
        })),
      };

    case 'TOGGLE_SELECTION': {
      const isSelected = state.selectedIds.includes(action.itemId);
      const selectedIds = isSelected
        ? state.selectedIds.filter((id) => id !== action.itemId)
        : [...state.selectedIds, action.itemId];
      return {
        ...state,
        selectedIds,
        items: state.items.map((item) => ({
          ...item,
          selected: selectedIds.includes(item.id),
        })),
      };
    }

    case 'SELECT_ALL':
      return {
        ...state,
        selectedIds: state.items.map((item) => item.id),
        items: state.items.map((item) => ({ ...item, selected: true })),
      };

    case 'DESELECT_ALL':
      return {
        ...state,
        selectedIds: [],
        items: state.items.map((item) => ({ ...item, selected: false })),
      };

    case 'SET_PAGE_INFO':
      return { ...state, pageInfo: action.pageInfo };

    case 'SET_GALLERIES':
      return { ...state, galleries: action.galleries };

    case 'SET_TIERS':
      return { ...state, tiers: action.tiers };

    case 'SET_PRESETS':
      return { ...state, presets: action.presets };

    case 'SET_FOLDERS':
      return { ...state, folders: action.folders };

    case 'SET_AUTOMATION_STATUS':
      return { ...state, automationStatus: action.status };

    case 'SET_AUTOMATION_PROGRESS':
      return { ...state, automationProgress: action.progress };

    case 'SET_INVENTORY_CACHE':
      return { ...state, inventoryCache: action.cache };

    case 'MERGE_ITEMS': {
      const existingIds = new Set(state.items.map((i) => i.id));
      const newItems = action.items.filter((i) => !existingIds.has(i.id));
      return { ...state, items: [...state.items, ...newItems] };
    }

    case 'REMOVE_ITEMS': {
      const removeSet = new Set(action.itemIds);
      return {
        ...state,
        items: state.items.filter((i) => !removeSet.has(i.id)),
        selectedIds: state.selectedIds.filter((id) => !removeSet.has(id)),
      };
    }

    case 'ADD_OPERATION':
      return {
        ...state,
        operationHistory: [action.record, ...state.operationHistory].slice(0, 50),
      };

    case 'SET_OPERATION_HISTORY':
      return { ...state, operationHistory: action.history };

    case 'SET_THEME_MODE':
      return { ...state, themeMode: action.mode };

    case 'SET_THEME_OVERRIDE':
      return { ...state, themeOverride: action.override };

    default:
      return state;
  }
}
