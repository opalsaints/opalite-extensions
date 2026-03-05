/**
 * Schedule Strategy — schedule publication of selected stash items.
 *
 * For each item, sends a SCHEDULE_ITEM message to the service worker which:
 *   1. Opens a background tab to the stash item page (sta.sh)
 *   2. Extracts the deviationId from the page
 *   3. Navigates to the submit page
 *   4. Tells the content script on the submit page to fill the schedule form
 *   5. Closes the tab and returns the result
 *
 * Uses generateScheduleSlots() to compute dates/times with
 * configurable intervals and time windows.
 */

import type { IAutomationStrategy, AutomationContext } from '../interfaces';
import type { ScheduleConfig, AutomationResult, ValidationResult } from '../../shared/types';
import type { IMessagingAdapter } from '../../platform/interfaces';
import { generateScheduleSlots } from '../../shared/date-utils';
import { StepTimer } from '../step-timer';
import { TIMING } from '../../shared/constants';

export class ScheduleStrategy implements IAutomationStrategy {
  readonly id = 'schedule';
  readonly name = 'Schedule Publication';

  private messaging: IMessagingAdapter | null = null;

  /** Inject the messaging adapter so we can talk to the service worker. */
  setMessaging(messaging: IMessagingAdapter): void {
    this.messaging = messaging;
  }

  validate(config: unknown): ValidationResult {
    const cfg = config as ScheduleConfig;
    const errors: string[] = [];

    if (!cfg.startDate) errors.push('Start date is required');
    if (cfg.startHour < 0 || cfg.startHour > 23) errors.push('Start hour must be 0-23');
    if (cfg.intervalMinutes < 1) errors.push('Interval must be at least 1 minute');
    if (cfg.windowStart < 0 || cfg.windowStart > 23) errors.push('Window start must be 0-23');
    if (cfg.windowEnd < 0 || cfg.windowEnd > 23) errors.push('Window end must be 0-23');
    if (cfg.windowStart >= cfg.windowEnd) errors.push('Window start must be before window end');

    return { valid: errors.length === 0, errors };
  }

  async execute(config: unknown, ctx: AutomationContext): Promise<AutomationResult> {
    const cfg = config as ScheduleConfig;
    const { store, eventBus, logger, signal, pauseGate, progress } = ctx;
    const timer = new StepTimer(eventBus, this.id);

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

    // Determine items based on scope
    let items: Array<{ stashUrl: string; title: string; scheduledDate?: string }>;

    if (cfg.scope && cfg.scope !== 'selected') {
      // Scan stash pages to get item list (scope determines URL + folder behavior)
      logger.info(`Scanning stash (scope=${cfg.scope}) to collect items...`, 'ScheduleStrategy');
      progress.setTotal(1);
      progress.advance('Scanning stash pages...');

      const scanUrl = cfg.scope === 'all-stash'
        ? 'https://www.deviantart.com/stash'
        : window.location.href;

      const scanResult = await this.messaging.send({
        type: 'SCAN_ALL_PAGES',
        stashUrl: scanUrl,
      }) as { success: boolean; items: Array<{ id: string; title: string; stashUrl: string; type: string }>; error?: string };

      if (!scanResult?.success) {
        return {
          success: false,
          strategyId: this.id,
          processed: 0,
          failed: 0,
          skipped: 0,
          errors: [{ item: '', error: scanResult?.error || 'Failed to scan stash pages' }],
          durationMs: 0,
        };
      }

      // Filter to files only (exclude folders)
      items = scanResult.items
        .filter((i) => i.type === 'file')
        .map((i) => ({ stashUrl: i.stashUrl, title: i.title }));

      logger.info(`Scan complete: ${items.length} items across all pages`, 'ScheduleStrategy');
    } else {
      // Default: selected items only
      const selectedIds = store.getState().selectedIds;
      items = store.getState().items.filter((i) => selectedIds.includes(i.id));
    }

    if (items.length === 0) {
      return {
        success: false,
        strategyId: this.id,
        processed: 0,
        failed: 0,
        skipped: 0,
        errors: [{ item: '', error: cfg.scope && cfg.scope !== 'selected' ? 'No items found in the selected scope' : 'No items selected' }],
        durationMs: 0,
      };
    }

    // Generate schedule slots
    const slots = generateScheduleSlots(
      items.length,
      cfg.startDate,
      cfg.startHour,
      cfg.intervalMinutes,
      cfg.windowStart,
      cfg.windowEnd,
    );

    progress.setTotal(items.length);
    const errors: Array<{ item: string; error: string }> = [];
    let processed = 0;
    let failed = 0;

    logger.info(
      `Scheduling ${items.length} items: ${cfg.startDate} starting ${cfg.startHour}:00, every ${cfg.intervalMinutes}min`,
      'ScheduleStrategy',
    );

    const itemTimings: number[] = [];

    for (let i = 0; i < items.length; i++) {
      if (signal.aborted) break;
      await pauseGate.waitIfPaused();

      const item = items[i];
      const slot = slots[i];
      const itemStart = Date.now();

      timer.start();
      logger.info(
        `[${i + 1}/${items.length}] Scheduling: ${item.title} → ${slot.dateString} ${slot.displayTime}`,
        'ScheduleStrategy',
      );

      try {
        // Send SCHEDULE_ITEM to service worker — it handles the full
        // tab lifecycle (open → extract ID → submit page → fill form → close)
        const result = await this.messaging.send({
          type: 'SCHEDULE_ITEM',
          stashUrl: item.stashUrl,
          targetDate: slot.dateString,
          hour: slot.hour,
          setTier: cfg.setTier,
          tierIds: cfg.tierIds,
          isAlreadyScheduled: !!item.scheduledDate,
        }) as { success: boolean; error?: string };

        if (!result?.success) {
          throw new Error(result?.error || 'Service worker returned failure');
        }

        processed++;
        timer.end(`schedule-item-${i}`);
        itemTimings.push(Date.now() - itemStart);
        if (itemTimings.length > 0) {
          const avgMs = itemTimings.reduce((a, b) => a + b, 0) / itemTimings.length;
          progress.setEta(Math.round(avgMs * (items.length - i - 1)));
        }
        progress.advance(item.title);

        logger.success(
          `Scheduled: ${item.title} → ${slot.dateString} ${slot.displayTime}`,
          'ScheduleStrategy',
        );

        // Delay between items to avoid overwhelming DA
        if (i < items.length - 1) {
          await sleep(TIMING.ITEM_DELAY);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed: ${item.title} — ${errorMsg}`, 'ScheduleStrategy');
        errors.push({ item: item.title, error: errorMsg });
        failed++;
        timer.end(`schedule-item-${i}-failed`);
        itemTimings.push(Date.now() - itemStart);
        if (itemTimings.length > 0) {
          const avgMs = itemTimings.reduce((a, b) => a + b, 0) / itemTimings.length;
          progress.setEta(Math.round(avgMs * (items.length - i - 1)));
        }
        progress.advance(item.title);
      }
    }

    return {
      success: failed === 0,
      strategyId: this.id,
      processed,
      failed,
      skipped: items.length - processed - failed,
      errors,
      durationMs: 0,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
