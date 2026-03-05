/**
 * Typed event map — defines every event in the extension.
 * Grouped by source module.
 */

import type {
  AutomationResult,
  ScheduleConfig,
  TierConfig,
  EditConfig,
  OperationProgress,
} from '../../shared/types';
import type { StashItem, PageInfo, Gallery, Tier } from '../state/store.types';

// ── Mapper Events ──

export interface MapperDiff {
  added: StashItem[];
  removed: string[];
  modified: StashItem[];
}

export interface SubmitFormState {
  deviationId: string;
  title: string;
  tags: string[];
  description: string;
  galleryIds: string[];
  tierIds: string[];
  isScheduled: boolean;
  scheduledDate?: string;
  mature: boolean;
  aiGenerated: boolean;
  noAi: boolean;
}

// ── Full Event Map ──

export interface EventMap {
  // Mapper → Store bridge
  'mapper:page-state-updated': { items: StashItem[]; pageInfo: PageInfo };
  'mapper:selection-changed': { selectedIds: string[] };
  'mapper:mutation-detected': MapperDiff;
  'mapper:initial-load-complete': { galleries: Gallery[]; tiers: Tier[]; presets: string[] };
  'mapper:refresh-complete': { diff: MapperDiff };
  'mapper:cross-page-progress': { current: number; total: number; items: StashItem[] };
  'mapper:cross-page-complete': { items: StashItem[] };
  'mapper:submit-page-captured': { formState: SubmitFormState };

  // Automation lifecycle
  'automation:started': { strategyId: string; itemCount: number };
  'automation:progress': OperationProgress;
  'automation:step-complete': { strategyId: string; stepName: string; durationMs: number };
  'automation:paused': { strategyId: string };
  'automation:resumed': { strategyId: string };
  'automation:cancelled': { strategyId: string; reason: string };
  'automation:completed': AutomationResult;
  'automation:error': { strategyId: string; error: string; item?: string; recoverable: boolean };

  // UI → Automation commands
  'command:start-schedule': ScheduleConfig;
  'command:start-tier': TierConfig;
  'command:start-edit': EditConfig;
  'command:pause': undefined;
  'command:resume': undefined;
  'command:cancel': undefined;
  'command:refresh': undefined;
  'command:scan-all-pages': undefined;

  // Store change notifications (Store → UI)
  'store:items-changed': { items: StashItem[] };
  'store:selection-changed': { selectedIds: string[] };
  'store:page-changed': { pageInfo: PageInfo };
  'store:config-changed': { galleries: Gallery[]; tiers: Tier[] };
  'store:automation-status-changed': { status: string };

  // Log events
  'log:entry': { level: string; message: string; context?: string };
}
