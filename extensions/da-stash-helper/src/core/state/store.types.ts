/**
 * State types — the data model of the extension.
 * Zero dependencies on platform or Chrome.
 */

import type { OperationStatus, FolderNode } from '../../shared/types';

// ── Core Domain Types ──

export interface StashItem {
  id: string;                    // DA stash item ID (from URL hash)
  title: string;
  thumbnailUrl?: string;
  stashUrl: string;              // /stash/0xxxxxx
  deviationUrl?: string;         // Full deviation URL (if published)
  type: 'file' | 'folder';
  selected: boolean;
  parentFolderId?: string;
  tags?: string[];
  labels?: string[];             // 'NoAI', 'AI-Generated', 'Mature'
  dateAdded?: string;
  /** If this item has been scheduled, the displayed schedule date (e.g. "May 7, 09:00 AM") */
  scheduledDate?: string;
}

export interface PageInfo {
  pageType: PageType;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  currentFolderId?: string;
  currentFolderName?: string;
  viewMode: 'list' | 'grid';
  url: string;
}

export type PageType =
  | 'stash'             // /stash/ (root)
  | 'stash-folder'      // /stash/2xxxxx
  | 'stash-item'        // /stash/0xxxxx (single item view)
  | 'submit'            // /_deviation_submit/
  | 'studio'            // /studio/*
  | 'galleries'         // /studio/published/galleries
  | 'gallery'           // /studio/published/{galleryId}
  | 'tier'              // /studio/tier/{tierId}/deviations
  | 'other';

export interface Gallery {
  id: string;
  name: string;
  deviationCount: number;
  isPremium: boolean;
  isDefault: boolean;
  url: string;
}

export interface Tier {
  id: string;
  name: string;
  deviationCount: number;
  url: string;
}

export interface StashFolder {
  id: string;
  name: string;
  url: string;
  parentId?: string;
}

// ── Operation History ──

export interface OperationRecord {
  id: string;
  timestamp: number;
  type: 'schedule' | 'tier' | 'edit';
  processed: number;
  failed: number;
  durationMs: number;
  success: boolean;
}

// ── Navigation ──

export type Route =
  | { page: 'dashboard' }
  | { page: 'schedule' }
  | { page: 'tier' }
  | { page: 'edit' };

// ── Application State ──

export interface StashState {
  // Navigation
  currentRoute: Route;

  // Current page data
  items: StashItem[];
  selectedIds: string[];
  pageInfo: PageInfo;

  // User config (from InitialLoadMapper)
  galleries: Gallery[];
  tiers: Tier[];
  presets: string[];
  folders: StashFolder[];

  // Automation state
  automationStatus: OperationStatus;
  automationProgress: {
    current: number;
    total: number;
    currentItem?: string;
    etaMs?: number;
  } | null;

  // Inventory cache (from full page scan)
  inventoryCache: {
    count: number;
    lastScan: number;
    totalWithFolders?: number;
    folderTree?: FolderNode[];
  } | null;

  // Operation history
  operationHistory: OperationRecord[];

  // Theme
  themeMode: 'dark' | 'light';
  themeOverride: 'dark' | 'light' | null;
}

export function createInitialState(): StashState {
  return {
    currentRoute: { page: 'dashboard' },
    items: [],
    selectedIds: [],
    pageInfo: {
      pageType: 'other',
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      itemsPerPage: 50,
      viewMode: 'list',
      url: '',
    },
    galleries: [],
    tiers: [],
    presets: [],
    folders: [],
    automationStatus: 'idle',
    automationProgress: null,
    inventoryCache: null,
    operationHistory: [],
    themeMode: 'dark',
    themeOverride: null,
  };
}
