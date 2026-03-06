/**
 * Typed store actions — flux-like pattern.
 * Each action describes a state transition.
 */

import type { OperationStatus } from '../../shared/types';
import type { StashState, StashItem, PageInfo, Gallery, Tier, StashFolder, Route, OperationRecord } from './store.types';

export type StoreAction =
  | { type: 'SET_ROUTE'; route: Route }
  | { type: 'SET_ITEMS'; items: StashItem[] }
  | { type: 'SET_SELECTION'; selectedIds: string[] }
  | { type: 'TOGGLE_SELECTION'; itemId: string }
  | { type: 'SELECT_ALL' }
  | { type: 'DESELECT_ALL' }
  | { type: 'SET_PAGE_INFO'; pageInfo: PageInfo }
  | { type: 'SET_GALLERIES'; galleries: Gallery[] }
  | { type: 'SET_TIERS'; tiers: Tier[] }
  | { type: 'SET_PRESETS'; presets: string[] }
  | { type: 'SET_FOLDERS'; folders: StashFolder[] }
  | { type: 'SET_AUTOMATION_STATUS'; status: OperationStatus }
  | { type: 'SET_AUTOMATION_PROGRESS'; progress: { current: number; total: number; currentItem?: string; etaMs?: number } | null }
  | { type: 'SET_INVENTORY_CACHE'; cache: StashState['inventoryCache'] }
  | { type: 'MERGE_ITEMS'; items: StashItem[] }
  | { type: 'REMOVE_ITEMS'; itemIds: string[] }
  | { type: 'ADD_OPERATION'; record: OperationRecord }
  | { type: 'SET_OPERATION_HISTORY'; history: OperationRecord[] }
  | { type: 'SET_THEME_MODE'; mode: 'dark' | 'light' }
  | { type: 'SET_THEME_OVERRIDE'; override: 'dark' | 'light' | null };

// ── Action Creators ──

export const actions = {
  setRoute: (route: Route): StoreAction => ({ type: 'SET_ROUTE', route }),
  setItems: (items: StashItem[]): StoreAction => ({ type: 'SET_ITEMS', items }),
  setSelection: (selectedIds: string[]): StoreAction => ({ type: 'SET_SELECTION', selectedIds }),
  toggleSelection: (itemId: string): StoreAction => ({ type: 'TOGGLE_SELECTION', itemId }),
  selectAll: (): StoreAction => ({ type: 'SELECT_ALL' }),
  deselectAll: (): StoreAction => ({ type: 'DESELECT_ALL' }),
  setPageInfo: (pageInfo: PageInfo): StoreAction => ({ type: 'SET_PAGE_INFO', pageInfo }),
  setGalleries: (galleries: Gallery[]): StoreAction => ({ type: 'SET_GALLERIES', galleries }),
  setTiers: (tiers: Tier[]): StoreAction => ({ type: 'SET_TIERS', tiers }),
  setPresets: (presets: string[]): StoreAction => ({ type: 'SET_PRESETS', presets }),
  setFolders: (folders: StashFolder[]): StoreAction => ({ type: 'SET_FOLDERS', folders }),
  setAutomationStatus: (status: OperationStatus): StoreAction => ({ type: 'SET_AUTOMATION_STATUS', status }),
  setAutomationProgress: (progress: { current: number; total: number; currentItem?: string; etaMs?: number } | null): StoreAction =>
    ({ type: 'SET_AUTOMATION_PROGRESS', progress }),
  setInventoryCache: (cache: StashState['inventoryCache']): StoreAction =>
    ({ type: 'SET_INVENTORY_CACHE', cache }),
  mergeItems: (items: StashItem[]): StoreAction => ({ type: 'MERGE_ITEMS', items }),
  removeItems: (itemIds: string[]): StoreAction => ({ type: 'REMOVE_ITEMS', itemIds }),
  addOperation: (record: OperationRecord): StoreAction => ({ type: 'ADD_OPERATION', record }),
  setOperationHistory: (history: OperationRecord[]): StoreAction => ({ type: 'SET_OPERATION_HISTORY', history }),
  setThemeMode: (mode: 'dark' | 'light'): StoreAction => ({ type: 'SET_THEME_MODE', mode }),
  setThemeOverride: (override: 'dark' | 'light' | null): StoreAction => ({ type: 'SET_THEME_OVERRIDE', override }),
} as const;
