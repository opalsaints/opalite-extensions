/**
 * Abstract base component — vanilla TS component system.
 *
 * Every UI component extends this class and implements render().
 * Provides lifecycle hooks: mount, unmount, watch (store subscriptions).
 */

import type { IStore } from '../../core/state/store';
import type { StashState } from '../../core/state/store.types';

export abstract class BaseComponent {
  protected el: HTMLElement;
  protected store: IStore | null = null;
  private subscriptions: Array<() => void> = [];
  private mounted = false;

  constructor(tag = 'div', className?: string) {
    this.el = document.createElement(tag);
    if (className) {
      this.el.className = className;
    }
  }

  /**
   * Provide a store for reactive subscriptions.
   */
  setStore(store: IStore): this {
    this.store = store;
    return this;
  }

  /**
   * Mount this component into a parent element.
   */
  mount(parent: HTMLElement): void {
    // Clear previous content to prevent duplicate rendering
    while (this.el.firstChild) {
      this.el.removeChild(this.el.firstChild);
    }
    parent.appendChild(this.el);
    this.mounted = true;
    this.render();
    this.onMount();
  }

  /**
   * Unmount and clean up.
   */
  unmount(): void {
    this.onUnmount();
    this.unsubscribeAll();
    this.el.remove();
    this.mounted = false;
  }

  /**
   * Get the DOM element.
   */
  getElement(): HTMLElement {
    return this.el;
  }

  /**
   * Subscribe to store changes with a selector.
   * Automatically cleaned up on unmount.
   */
  protected watch<T>(selector: (state: StashState) => T, callback: (value: T) => void): void {
    if (!this.store) {
      console.warn('[BaseComponent] No store set — cannot watch');
      return;
    }
    const unsub = this.store.subscribe(selector, callback);
    this.subscriptions.push(unsub);
  }

  /**
   * Render the component's content.
   * Called on mount and can be called manually to re-render.
   */
  protected abstract render(): void;

  /**
   * Lifecycle hook — called after mount.
   * Override to set up event listeners, start animations, etc.
   */
  protected onMount(): void {}

  /**
   * Lifecycle hook — called before unmount.
   * Override to clean up event listeners, timers, etc.
   */
  protected onUnmount(): void {}

  /**
   * Helper: set text content safely.
   */
  protected setText(selector: string, text: string): void {
    const target = this.el.querySelector(selector);
    if (target) target.textContent = text;
  }

  /**
   * Helper: add event listener with automatic cleanup.
   */
  protected on<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    event: K,
    handler: (e: HTMLElementEventMap[K]) => void,
  ): void {
    target.addEventListener(event, handler as EventListener);
    this.subscriptions.push(() => target.removeEventListener(event, handler as EventListener));
  }

  private unsubscribeAll(): void {
    for (const unsub of this.subscriptions) {
      unsub();
    }
    this.subscriptions = [];
  }
}
