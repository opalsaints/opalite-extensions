/**
 * StepTimer — per-step timing for automation steps.
 *
 * Tracks how long each step takes and reports via EventBus.
 */

import type { IEventBus } from '../core/events/event-bus';
import type { EventMap } from '../core/events/event-types';

export class StepTimer {
  private startTime = 0;

  constructor(
    private eventBus: IEventBus<EventMap>,
    private strategyId: string,
  ) {}

  /**
   * Start timing a step.
   */
  start(): void {
    this.startTime = performance.now();
  }

  /**
   * End timing and emit the step-complete event.
   */
  end(stepName: string): number {
    const durationMs = Math.round(performance.now() - this.startTime);

    this.eventBus.emit('automation:step-complete', {
      strategyId: this.strategyId,
      stepName,
      durationMs,
    });

    return durationMs;
  }
}
