/**
 * Orchestrator — runs automation strategies with pause/resume/cancel support.
 *
 * Only one automation can run at a time. The orchestrator:
 *   1. Validates the config
 *   2. Sets up the AutomationContext (signal, pauseGate, progress)
 *   3. Runs the strategy
 *   4. Reports results via EventBus
 */

import type { IAutomationStrategy, AutomationContext, PauseGate } from './interfaces';
import type { IStore } from '../core/state/store';
import type { IEventBus } from '../core/events/event-bus';
import type { EventMap } from '../core/events/event-types';
import type { ILogger } from '../core/logger/logger.interface';
import type { AutomationResult } from '../shared/types';
import { Progress } from './progress';
import { actions } from '../core/state/actions';

export class Orchestrator {
  private strategies = new Map<string, IAutomationStrategy>();
  private abortController: AbortController | null = null;
  private pauseGate: PauseGateImpl | null = null;
  private running = false;

  constructor(
    private store: IStore,
    private eventBus: IEventBus<EventMap>,
    private logger: ILogger,
  ) {
    // Listen for control commands
    eventBus.on('command:pause', () => this.pause());
    eventBus.on('command:resume', () => this.resume());
    eventBus.on('command:cancel', () => this.cancel());
  }

  /**
   * Register a strategy.
   */
  register(strategy: IAutomationStrategy): void {
    this.strategies.set(strategy.id, strategy);
    this.logger.debug(`Registered strategy: ${strategy.id}`, 'Orchestrator');
  }

  /**
   * Run a strategy by ID with the given config.
   */
  async run(strategyId: string, config: unknown): Promise<AutomationResult> {
    if (this.running) {
      return {
        success: false,
        strategyId,
        processed: 0,
        failed: 0,
        skipped: 0,
        errors: [{ item: '', error: 'Another automation is already running' }],
        durationMs: 0,
      };
    }

    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      return {
        success: false,
        strategyId,
        processed: 0,
        failed: 0,
        skipped: 0,
        errors: [{ item: '', error: `Strategy "${strategyId}" not found` }],
        durationMs: 0,
      };
    }

    // Validate
    const validation = strategy.validate(config);
    if (!validation.valid) {
      return {
        success: false,
        strategyId,
        processed: 0,
        failed: 0,
        skipped: 0,
        errors: validation.errors.map((e) => ({ item: '', error: e })),
        durationMs: 0,
      };
    }

    // Set up context
    this.abortController = new AbortController();
    this.pauseGate = new PauseGateImpl();
    const progress = new Progress(this.eventBus);

    const ctx: AutomationContext = {
      store: this.store,
      eventBus: this.eventBus,
      logger: this.logger,
      signal: this.abortController.signal,
      pauseGate: this.pauseGate,
      progress,
    };

    // Run
    this.running = true;
    this.store.dispatch(actions.setAutomationStatus('running'));
    const selectedCount = this.store.getState().selectedIds.length;

    this.eventBus.emit('automation:started', { strategyId, itemCount: selectedCount });
    this.logger.info(`Starting automation: ${strategy.name} (${selectedCount} items)`, 'Orchestrator');

    const startTime = performance.now();

    let result: AutomationResult;
    try {
      result = await strategy.execute(config, ctx);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      result = {
        success: false,
        strategyId,
        processed: progress.getProgress().current,
        failed: 1,
        skipped: 0,
        errors: [{ item: '', error: errorMsg }],
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    result.durationMs = Math.round(performance.now() - startTime);

    // Report
    this.running = false;
    this.abortController = null;
    this.pauseGate = null;

    const finalStatus = result.success ? 'completed' : 'error';
    this.store.dispatch(actions.setAutomationStatus(finalStatus));
    this.eventBus.emit('automation:completed', result);

    this.logger.info(
      `Automation complete: ${result.processed} processed, ${result.failed} failed, ${result.durationMs}ms`,
      'Orchestrator',
    );

    return result;
  }

  /**
   * Pause the running automation.
   */
  pause(): void {
    if (this.pauseGate && !this.pauseGate.isPaused) {
      this.pauseGate.pause();
      this.store.dispatch(actions.setAutomationStatus('paused'));
      this.eventBus.emit('automation:paused', { strategyId: '' });
      this.logger.info('Automation paused', 'Orchestrator');
    }
  }

  /**
   * Resume the paused automation.
   */
  resume(): void {
    if (this.pauseGate && this.pauseGate.isPaused) {
      this.pauseGate.resume();
      this.store.dispatch(actions.setAutomationStatus('running'));
      this.eventBus.emit('automation:resumed', { strategyId: '' });
      this.logger.info('Automation resumed', 'Orchestrator');
    }
  }

  /**
   * Cancel the running automation.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.store.dispatch(actions.setAutomationStatus('cancelled'));
      this.eventBus.emit('automation:cancelled', { strategyId: '', reason: 'User cancelled' });
      this.logger.info('Automation cancelled', 'Orchestrator');
    }
  }

  /**
   * Check if an automation is currently running.
   */
  get isRunning(): boolean {
    return this.running;
  }
}

// ── PauseGate Implementation ──

class PauseGateImpl implements PauseGate {
  private _isPaused = false;
  private resolve: (() => void) | null = null;

  get isPaused(): boolean {
    return this._isPaused;
  }

  async waitIfPaused(): Promise<void> {
    if (!this._isPaused) return;

    return new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }

  pause(): void {
    this._isPaused = true;
  }

  resume(): void {
    this._isPaused = false;
    if (this.resolve) {
      this.resolve();
      this.resolve = null;
    }
  }
}
