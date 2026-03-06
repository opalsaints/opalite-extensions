import type { IStorageAdapter, StorageChangeCallback } from './interfaces';

/**
 * In-memory storage adapter for testing.
 * No Chrome dependency — works in Node.js/jsdom.
 */
export class MemoryStorageAdapter implements IStorageAdapter {
  private data = new Map<string, unknown>();
  private listeners = new Set<StorageChangeCallback>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    const oldValue = this.data.get(key);
    this.data.set(key, value);
    for (const cb of this.listeners) {
      cb(key, value, oldValue);
    }
  }

  async remove(key: string): Promise<void> {
    const oldValue = this.data.get(key);
    this.data.delete(key);
    for (const cb of this.listeners) {
      cb(key, undefined, oldValue);
    }
  }

  onChanged(callback: StorageChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** Test helper: get all stored data */
  getAll(): Map<string, unknown> {
    return new Map(this.data);
  }

  /** Test helper: clear all data */
  clear(): void {
    this.data.clear();
  }
}
