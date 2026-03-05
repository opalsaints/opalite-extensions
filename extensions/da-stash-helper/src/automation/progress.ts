/**
 * ProgressController — tracks automation progress and emits events.
 */

import type { ProgressController } from './interfaces';
import type { IEventBus } from '../core/events/event-bus';
import type { EventMap } from '../core/events/event-types';
import type { OperationProgress, OperationStatus } from '../shared/types';

export class Progress implements ProgressController {
  private current = 0;
  private total = 0;
  private currentItem?: string;
  private status: OperationStatus = 'idle';
  private etaMs?: number;

  constructor(private eventBus: IEventBus<EventMap>) {}

  setTotal(total: number): void {
    this.total = total;
    this.current = 0;
    this.status = 'running';
    this.emit();
  }

  advance(currentItem?: string): void {
    this.current++;
    this.currentItem = currentItem;
    this.emit();
  }

  setEta(etaMs: number): void {
    this.etaMs = etaMs;
    this.emit();
  }

  setStatus(status: OperationStatus): void {
    this.status = status;
    this.emit();
  }

  getProgress(): OperationProgress {
    return {
      current: this.current,
      total: this.total,
      currentItem: this.currentItem,
      status: this.status,
      etaMs: this.etaMs,
    };
  }

  reset(): void {
    this.current = 0;
    this.total = 0;
    this.currentItem = undefined;
    this.status = 'idle';
    this.etaMs = undefined;
  }

  private emit(): void {
    this.eventBus.emit('automation:progress', this.getProgress());
  }
}
