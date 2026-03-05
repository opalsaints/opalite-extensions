/**
 * Render target interface — abstraction for where the UI mounts.
 *
 * Currently uses ShadowDomRenderer to inject sidebar into DA page via Shadow DOM.
 */

export interface IRenderTarget {
  /** Get the root element where components should mount */
  getRoot(): HTMLElement;

  /** Attach a stylesheet to the render target */
  attachStyles(css: string): void;

  /** Mount the render target (create shadow root, append to DOM, etc.) */
  mount(): void;

  /** Unmount and clean up */
  unmount(): void;

  /** Set the theme on the host element (e.g., data-theme="dark" or "light") */
  setTheme(theme: 'dark' | 'light'): void;

  /** Whether the render target is isolated (Shadow DOM = true, Side Panel = false) */
  readonly isIsolated: boolean;
}
