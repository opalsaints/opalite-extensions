/**
 * Edit Strategy — bulk edit title/description with templates.
 *
 * Flow:
 *   1. Items must be selected
 *   2. Open Edit dropdown → click "Title" or "Description"
 *   3. Select mode (Insert at beginning / Insert at end / Replace entirely)
 *   4. Fill the field with the template-resolved value
 *   5. Save Changes → confirm "Update All"
 *
 * Templates support variables like {filename}, {n}, {title}, {date}.
 */

import type { IAutomationStrategy, AutomationContext } from '../interfaces';
import type { EditConfig, AutomationResult, ValidationResult } from '../../shared/types';
import type { IMessagingAdapter } from '../../platform/interfaces';
import { openEditMenu } from '../steps/open-edit-menu.step';
import { clickMenuItemStep } from '../steps/click-menu-item.step';
import { saveChanges } from '../steps/save-changes.step';
import { fillTitle, fillDescription } from '../steps/template-fill.step';
import { EDIT_MENU_ITEMS } from '../../core/dom/selectors';
import { TIMING } from '../../shared/constants';
import { StepTimer } from '../step-timer';
import type { TemplateContext } from '../../shared/template-engine';

export class EditStrategy implements IAutomationStrategy {
  readonly id = 'edit';
  readonly name = 'Bulk Edit';

  private messaging: IMessagingAdapter | null = null;

  /** Inject the messaging adapter so we can talk to the service worker. */
  setMessaging(messaging: IMessagingAdapter): void {
    this.messaging = messaging;
  }

  validate(config: unknown): ValidationResult {
    const cfg = config as EditConfig;
    const errors: string[] = [];

    if (!cfg.field || !['title', 'description'].includes(cfg.field)) {
      errors.push('Field must be "title" or "description"');
    }

    if (!cfg.template || cfg.template.trim().length === 0) {
      errors.push('Template must not be empty');
    }

    if (!cfg.mode || !['prepend', 'append', 'replace'].includes(cfg.mode)) {
      errors.push('Mode must be "prepend", "append", or "replace"');
    }

    return { valid: errors.length === 0, errors };
  }

  async execute(config: unknown, ctx: AutomationContext): Promise<AutomationResult> {
    const cfg = config as EditConfig;
    const { store, eventBus, logger, signal, pauseGate, progress } = ctx;
    const timer = new StepTimer(eventBus, this.id);

    // ── Multi-page Mode: delegate page-walk to service worker ──
    if (cfg.scope && cfg.scope !== 'selected') {
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

      progress.setTotal(1); // Will be updated by BULK_PROGRESS messages
      logger.info(`Edit (scope=${cfg.scope}): ${cfg.field} (${cfg.mode})`, 'EditStrategy');

      // Get our tab ID so the service worker can send progress back
      const tabIdResult = await this.messaging.send({ type: 'GET_TAB_ID' }) as { tabId: number };
      const liveTabId = tabIdResult?.tabId ?? -1;

      // Get total item count from pageInfo for the template context
      const totalItems = store.getState().pageInfo.totalItems ?? 0;

      const result = await this.messaging.send({
        type: 'BULK_EDIT_ALL_PAGES',
        field: cfg.field,
        template: cfg.template,
        editMode: cfg.mode,
        itemCount: totalItems,
        liveTabId,
        scope: cfg.scope,
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

    const menuItem = cfg.field === 'title' ? EDIT_MENU_ITEMS.title : EDIT_MENU_ITEMS.description;

    progress.setTotal(4);

    try {
      // Check cancellation
      if (signal.aborted) throw new Error('Cancelled');
      await pauseGate.waitIfPaused();

      // Step 1: Open Edit dropdown
      timer.start();
      logger.info(`Opening Edit menu for ${cfg.field}...`, 'EditStrategy');
      const menuOpened = await openEditMenu();
      timer.end('open-edit-menu');

      if (!menuOpened) {
        return this.fail(`Failed to open Edit menu`, errors);
      }
      progress.advance('Opened Edit menu');

      // Step 2: Click the target menu item (Title or Description)
      if (signal.aborted) throw new Error('Cancelled');
      await pauseGate.waitIfPaused();

      timer.start();
      const itemClicked = await clickMenuItemStep(menuItem);
      timer.end(`click-${cfg.field}`);

      if (!itemClicked) {
        return this.fail(`Failed to click "${menuItem}" menu item`, errors);
      }
      progress.advance(`Selected ${menuItem}`);

      await sleep(TIMING.STEP_DELAY);

      // Step 3: Fill the field
      if (signal.aborted) throw new Error('Cancelled');
      await pauseGate.waitIfPaused();

      timer.start();

      // Build template context.
      // DA's bulk edit applies one value to ALL selected items, so per-item
      // variables like {filename} and {n} reflect the first selected item.
      // {total} and {date}/{time} are meaningful in bulk context.
      const selectedItems = store.getState().items.filter((i) => selectedIds.includes(i.id));
      const firstItem = selectedItems[0];
      const templateCtx: TemplateContext = {
        n: 1,
        total: selectedIds.length,
        filename: firstItem?.title || '',
        title: firstItem?.title || '',
      };

      let filled = false;
      if (cfg.field === 'title') {
        filled = await fillTitle(cfg.template, templateCtx, cfg.mode);
      } else {
        filled = await fillDescription(cfg.template, templateCtx, cfg.mode);
      }

      timer.end(`fill-${cfg.field}`);

      if (!filled) {
        return this.fail(`Failed to fill ${cfg.field} field`, errors);
      }
      progress.advance(`Filled ${cfg.field}`);

      // Step 4: Save Changes
      if (signal.aborted) throw new Error('Cancelled');
      await pauseGate.waitIfPaused();

      timer.start();
      logger.info('Saving changes...', 'EditStrategy');
      const saved = await saveChanges();
      timer.end('save-changes');

      if (!saved) {
        return this.fail('Failed to save changes', errors);
      }
      progress.advance('Changes saved');

      logger.success(
        `Bulk edit complete: ${cfg.field} ${cfg.mode}d for ${selectedIds.length} items`,
        'EditStrategy',
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
