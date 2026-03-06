/**
 * @opalite/shared — shared code for all Opalite Chrome extensions
 *
 * Each extension imports only what it needs:
 *   import { setupOpaliteAuth } from '@opalite/shared/auth';
 *   import { setupBackground } from '@opalite/shared/background';
 *
 * Or import types/configs from the barrel:
 *   import type { PlatformConfig } from '@opalite/shared';
 */

// Re-export all types
export type {
  PlatformConfig,
  PlatformBranding,
  OpaliteUser,
  OpaliteAuthAPI,
  AuthExchangeResult,
  OpaliteSocketAPI,
  DownloadPayload,
  BulkDownloadPayload,
  PlanStatusData,
  PlanLimits,
  PlanUsage,
  PlanCredits,
  BackgroundConfig,
  CallbackConfig,
  ContentLoaderConfig,
  PopupConfig,
} from './types';

// Re-export setup functions
export { setupOpaliteAuth } from './auth';
export { setupStorageBridge } from './inject';
export { setupOpaliteSocket } from './socket';
export { setupAuthCallback } from './callback';
export { setupUpsellListener } from './upsell';
export { setupBackground } from './background';
export { initPopup } from './popup';
export { setupContentLoader } from './content-loader';
