/**
 * Tier Strategy — assign subscription tiers to selected items.
 *
 * Flow:
 *   1. Items must be selected (via UI or selectAll)
 *   2. Open Edit dropdown → click "Subscription tier"
 *   3. Open tier combobox → select tier(s)
 *   4. Click "Save Changes" → confirm "Update All"
 *   5. Wait for completion
 *
 * Supports pause/resume/cancel via AutomationContext.
 */

import type { IAutomationStrategy, AutomationContext } from '../interfaces';
import type { TierConfig, AutomationResult, ValidationResult } from '../../shared/types';
import type { IMessagingAdapter } from '../../platform/interfaces';
import { openEditMenu } from '../steps/open-edit-menu.step';
import { clickMenuItemStep } from '../steps/click-menu-item.step';
import { selectTiers } from '../steps/tier-combobox.step';
import { saveChanges } from '../steps/save-changes.step';
import { EDIT_MENU_ITEMS } from '../../core/dom/selectors';
import { TIMING } from '../../shared/constants';
import { StepTimer } from '../step-timer';

export class TierStrategy implements IAutomationStrategy {
  readonly id = 'tier';
  readonly name = 'Subscription Tier Assignment';

  private messaging: IMessagingAdapter | null = null;

  /** Inject the messaging adapter so we can talk to the service worker. */
  setMessaging(messaging: IMessagingAdapter): void {
    this.messaging = messaging;
  }

  validate(config: unknown): ValidationResult {
    const tierConfig = config as TierConfig;

    if (!tierConfig.tierIds || tierConfig.tierIds.length === 0) {
      return { valid: false, errors: ['At least one tier must be selected'] };
    }

    if (!tierConfig.mode || !['add', 'replace'].includes(tierConfig.mode)) {
      return { valid: false, errors: ['Mode must be "add" or "replace"'] };
    }

    return { valid: true, errors: [] };
  }

  async execute(config: unknown, ctx: AutomationContext): Promise<AutomationResult> {
    const tierConfig = config as TierConfig;
    const { store, eventBus, logger, signal, pauseGate, progress } = ctx;
    const timer = new StepTimer(eventBus, this.id);

    // ── Multi-page Mode: delegate page-walk to service worker ──
    if (tierConfig.scope && tierConfig.scope !== 'selected') {
      if (!this.messaging) {
        return {
          success: false,
          strategyId: this.id,
          processed: 0,
          failed: 0,
          skipped: 0,
          errors: [{ item: '', error: 'Messaging adapter not set — cannot communicate with service worker' }],
          durationMs: 0,
        };
      }

      // Resolve tier names from IDs
      const tiers = store.getState().tiers;
      const tierNames = tierConfig.tierIds
        .map((id) => tiers.find((t) => t.id === id)?.name)
        .filter((name): name is string => !!name);

      if (tierNames.length === 0) {
        tierNames.push(...tierConfig.tierIds);
      }

      progress.setTotal(1); // Will be updated by BULK_PROGRESS messages
      logger.info(`Tier (scope=${tierConfig.scope}): ${tierNames.join(', ')} (${tierConfig.mode})`, 'TierStrategy');

      // Get our tab ID so the service worker can send progress back
      const tabIdResult = await this.messaging.send({ type: 'GET_TAB_ID' }) as { tabId: number };
      const liveTabId = tabIdResult?.tabId ?? -1;

      const result = await this.messaging.send({
        type: 'BULK_TIER_ALL_PAGES',
        tierNames,
        tierMode: tierConfig.mode,
        liveTabId,
        scope: tierConfig.scope,
        stashUrl: window.location.href,
      }) as { success: boolean; processed: number; failed: number; errors: Array<{ item: string; error: string }> };

      return {
        success: result?.success ?? false,
        strategyId: this.id,
        processed: result?.processed ?? 0,
        failed: result?.failed ?? 0,
        skipped: 0,
        errors: result?.errors ?? [],
        durationMs: 0,
      };
    }

    // ── Selected Items Mode (default) ──
    const selectedIds = store.getState().selectedIds;
    const errors: Array<{ item: string; error: string }> = [];

    if (selectedIds.length === 0) {
      return {
        success: false,
        strategyId: this.id,
        processed: 0,
        failed: 0,
        skipped: 0,
        errors: [{ item: '', error: 'No items selected' }],
        durationMs: 0,
      };
    }

    progress.setTotal(4); // 4 steps: open menu, click tier, select tiers, save

    try {
      // Check for cancellation
      if (signal.aborted) throw new Error('Cancelled');
      await pauseGate.waitIfPaused();

      // Step 1: Open Edit dropdown
      timer.start();
      logger.info('Opening Edit menu...', 'TierStrategy');
      const menuOpened = await openEditMenu();
      timer.end('open-edit-menu');

      if (!menuOpened) {
        return this.fail('Failed to open Edit menu', errors);
      }
      progress.advance('Opened Edit menu');

      // Check for cancellation
      if (signal.aborted) throw new Error('Cancelled');
      await pauseGate.waitIfPaused();

      // Step 2: Click "Subscription tier" menu item
      timer.start();
      logger.info('Clicking Subscription tier...', 'TierStrategy');
      const tierClicked = await clickMenuItemStep(EDIT_MENU_ITEMS.subscriptionTier);
      timer.end('click-subscription-tier');

      if (!tierClicked) {
        return this.fail('Failed to click Subscription tier menu item', errors);
      }
      progress.advance('Selected Subscription tier');

      await sleep(TIMING.STEP_DELAY);

      // Check for cancellation
      if (signal.aborted) throw new Error('Cancelled');
      await pauseGate.waitIfPaused();

      // Step 3: Select tier(s) in the combobox
      timer.start();

      // Resolve tier names from IDs
      const tiers = store.getState().tiers;
      const tierNames = tierConfig.tierIds
        .map((id) => tiers.find((t) => t.id === id)?.name)
        .filter((name): name is string => !!name);

      if (tierNames.length === 0) {
        // Fall back to using IDs as names (user may have typed names directly)
        tierNames.push(...tierConfig.tierIds);
      }

      logger.info(`Selecting tiers (${tierConfig.mode}): ${tierNames.join(', ')}`, 'TierStrategy');
      const selectedCount = await selectTiers(tierNames, tierConfig.mode);
      timer.end('select-tiers');

      if (selectedCount === 0) {
        return this.fail('Failed to select any tiers in combobox', errors);
      }
      progress.advance(`Selected ${selectedCount} tier(s)`);

      // Check for cancellation
      if (signal.aborted) throw new Error('Cancelled');
      await pauseGate.waitIfPaused();

      // Step 4: Save Changes
      timer.start();
      logger.info('Saving changes...', 'TierStrategy');
      const saved = await saveChanges();
      timer.end('save-changes');

      if (!saved) {
        return this.fail('Failed to save changes', errors);
      }
      progress.advance('Changes saved');

      logger.success(
        `Tier assignment complete: ${selectedIds.length} items → ${tierNames.join(', ')}`,
        'TierStrategy',
      );

      return {
        success: true,
        strategyId: this.id,
        processed: selectedIds.length,
        failed: 0,
        skipped: 0,
        errors: [],
        durationMs: 0,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (errorMsg === 'Cancelled') {
        return {
          success: false,
          strategyId: this.id,
          processed: 0,
          failed: 0,
          skipped: selectedIds.length,
          errors: [],
          durationMs: 0,
        };
      }

      return this.fail(errorMsg, errors);
    }
  }

  private fail(
    error: string,
    errors: Array<{ item: string; error: string }>,
  ): AutomationResult {
    errors.push({ item: '', error });
    return {
      success: false,
      strategyId: this.id,
      processed: 0,
      failed: 1,
      skipped: 0,
      errors,
      durationMs: 0,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
