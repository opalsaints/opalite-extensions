/**
 * IIntegrationModule — pluggable integration interface.
 *
 * Future integrations (e.g., Isekai API, cloud sync, analytics)
 * implement this interface. The AppShell can register modules
 * which participate in the extension lifecycle.
 *
 * Example future modules:
 *   - IsekaiSyncModule: Syncs stash items to Isekai backend
 *   - AnalyticsModule: Tracks automation usage patterns
 *   - CloudBackupModule: Backup stash metadata to cloud storage
 */

import type { Container } from '../platform/container';

export interface IIntegrationModule {
  /** Unique identifier for this module. */
  readonly id: string;

  /** Human-readable name. */
  readonly name: string;

  /**
   * Initialize the module with the DI container.
   * Called once when the module is registered.
   * Return false to indicate the module failed to initialize.
   */
  init(container: Container): Promise<boolean>;

  /**
   * Destroy the module and clean up resources.
   * Called when the extension shuts down or the module is unregistered.
   */
  destroy(): void;

  /**
   * Whether the module is currently active.
   */
  readonly isActive: boolean;
}
