/**
 * Automation interfaces — Strategy pattern for different automation types.
 */

import type { IStore } from '../core/state/store';
import type { IEventBus } from '../core/events/event-bus';
import type { EventMap } from '../core/events/event-types';
import type { ILogger } from '../core/logger/logger.interface';
import type { AutomationResult, ValidationResult, OperationProgress } from '../shared/types';

// ── Automation Context ──
// Provided to each strategy during execution.

export interface AutomationContext {
  store: IStore;
  eventBus: IEventBus<EventMap>;
  logger: ILogger;
  signal: AbortSignal;        // For cancellation
  pauseGate: PauseGate;       // For pause/resume
  progress: ProgressController;
}

// ── Strategy Interface ──

export interface IAutomationStrategy {
  /** Unique identifier for this strategy */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Validate configuration before execution */
  validate(config: unknown): ValidationResult;

  /** Execute the automation */
  execute(config: unknown, ctx: AutomationContext): Promise<AutomationResult>;
}

// ── Pause Gate ──
// Allows strategies to check if they should pause between steps.

export interface PauseGate {
  /** Returns a promise that resolves when un-paused. Resolves immediately if not paused. */
  waitIfPaused(): Promise<void>;

  /** Pause execution. */
  pause(): void;

  /** Resume execution. */
  resume(): void;

  /** Check if currently paused. */
  readonly isPaused: boolean;
}

// ── Progress Controller ──

export interface ProgressController {
  /** Set the total number of items. */
  setTotal(total: number): void;

  /** Advance progress by one item. */
  advance(currentItem?: string): void;

  /** Set estimated time remaining in milliseconds. */
  setEta(etaMs: number): void;

  /** Get current progress state. */
  getProgress(): OperationProgress;

  /** Reset progress. */
  reset(): void;
}
