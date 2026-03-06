/**
 * Typed event bus — central nervous system of the extension.
 * All cross-module communication flows through here.
 * Zero Chrome dependencies.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IEventBus<TMap extends {}> {
  emit<K extends keyof TMap>(event: K, data: TMap[K]): void;
  on<K extends keyof TMap>(event: K, handler: (data: TMap[K]) => void): () => void;
  once<K extends keyof TMap>(event: K, handler: (data: TMap[K]) => void): () => void;
  off<K extends keyof TMap>(event: K, handler: (data: TMap[K]) => void): void;
  removeAll(): void;
}

export class EventBus<TMap extends {}> implements IEventBus<TMap> {
  private listeners = new Map<keyof TMap, Set<(data: any) => void>>();

  emit<K extends keyof TMap>(event: K, data: TMap[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${String(event)}":`, err);
      }
    }
  }

  on<K extends keyof TMap>(event: K, handler: (data: TMap[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => this.off(event, handler);
  }

  once<K extends keyof TMap>(event: K, handler: (data: TMap[K]) => void): () => void {
    const wrapper = ((data: TMap[K]) => {
      unsub();
      handler(data);
    }) as (data: TMap[K]) => void;

    const unsub = this.on(event, wrapper);
    return unsub;
  }

  off<K extends keyof TMap>(event: K, handler: (data: TMap[K]) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  removeAll(): void {
    this.listeners.clear();
  }

  /** Debug helper: list all registered event names */
  getRegisteredEvents(): string[] {
    return Array.from(this.listeners.keys()).map(String);
  }
}
