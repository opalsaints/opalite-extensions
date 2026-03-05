/**
 * Shadow DOM Renderer — injects a sidebar into the DA page.
 *
 * Creates a custom element with a Shadow DOM root to isolate
 * extension styles from DA's styles (and vice versa).
 *
 * The left edge of the sidebar is a draggable resize handle —
 * drag it to make the sidebar wider or narrower.
 */

import type { IRenderTarget } from './renderer.interface';

const HOST_ELEMENT_TAG = 'da-stash-helper';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 200;
const MAX_WIDTH_RATIO = 0.6; // never exceed 60% of viewport

export class ShadowDomRenderer implements IRenderTarget {
  readonly isIsolated = true;

  private hostElement: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private container: HTMLDivElement | null = null;
  private resizeHandle: HTMLDivElement | null = null;
  private layoutStyleTag: HTMLStyleElement | null = null;
  private currentWidth: number = DEFAULT_WIDTH;

  // Drag state
  private isDragging = false;
  private onMouseMove: ((e: MouseEvent) => void) | null = null;
  private onMouseUp: (() => void) | null = null;

  /**
   * Mount the sidebar into the DA page.
   * Creates a custom element with a Shadow DOM root.
   * Shrinks the page content by adding margin-right to the body.
   */
  mount(): void {
    // Remove existing instance if present
    const existing = document.querySelector(HOST_ELEMENT_TAG);
    if (existing) existing.remove();

    // Create host element
    this.hostElement = document.createElement(HOST_ELEMENT_TAG);
    this.hostElement.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: ${this.currentWidth}px;
      height: 100vh;
      z-index: 999999;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    // Create Shadow DOM
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

    // Create resize handle on the left edge
    this.resizeHandle = document.createElement('div');
    this.resizeHandle.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 5px;
      height: 100%;
      cursor: col-resize;
      z-index: 1;
      background: transparent;
      transition: background 0.15s;
    `;
    // Visual feedback on hover
    this.resizeHandle.addEventListener('mouseenter', () => {
      if (this.resizeHandle) this.resizeHandle.style.background = '#00e59b';
    });
    this.resizeHandle.addEventListener('mouseleave', () => {
      if (this.resizeHandle && !this.isDragging) {
        this.resizeHandle.style.background = 'transparent';
      }
    });

    // Drag to resize
    this.resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      this.isDragging = true;
      if (this.resizeHandle) this.resizeHandle.style.background = '#00e59b';

      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';

      this.onMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = window.innerWidth - moveEvent.clientX;
        const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;
        const clamped = Math.max(MIN_WIDTH, Math.min(newWidth, maxWidth));
        this.setWidth(clamped);
      };

      this.onMouseUp = () => {
        this.isDragging = false;
        document.body.style.userSelect = '';
        if (this.resizeHandle) this.resizeHandle.style.background = 'transparent';
        if (this.onMouseMove) document.removeEventListener('mousemove', this.onMouseMove);
        if (this.onMouseUp) document.removeEventListener('mouseup', this.onMouseUp);
        this.onMouseMove = null;
        this.onMouseUp = null;
      };

      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
    });

    // Create container inside shadow
    this.container = document.createElement('div');
    this.container.id = 'dsh-root';
    this.container.style.cssText = `
      width: 100%;
      height: 100%;
      overflow-y: auto;
      background: var(--dsh-bg-primary);
      color: var(--dsh-text-primary);
      border-left: 1px solid var(--dsh-border);
      box-sizing: border-box;
    `;

    this.shadowRoot.appendChild(this.resizeHandle);
    this.shadowRoot.appendChild(this.container);
    document.body.appendChild(this.hostElement);

    // Inject page-level CSS to squeeze DA's layout (body margin alone
    // doesn't work — DA uses position:fixed header + CSS Grid content).
    this.injectLayoutCSS(this.currentWidth);
  }

  /**
   * Unmount and clean up.
   */
  unmount(): void {
    // Clean up any in-progress drag
    if (this.onMouseMove) document.removeEventListener('mousemove', this.onMouseMove);
    if (this.onMouseUp) document.removeEventListener('mouseup', this.onMouseUp);
    this.onMouseMove = null;
    this.onMouseUp = null;

    // Remove injected page-level layout CSS
    this.layoutStyleTag?.remove();
    this.layoutStyleTag = null;

    this.hostElement?.remove();
    this.hostElement = null;
    this.shadowRoot = null;
    this.container = null;
    this.resizeHandle = null;
  }

  /**
   * Get the container element where components should mount.
   */
  getRoot(): HTMLElement {
    if (!this.container) {
      throw new Error('ShadowDomRenderer: not mounted. Call mount() first.');
    }
    return this.container;
  }

  /**
   * Attach a stylesheet to the shadow root.
   */
  attachStyles(css: string): void {
    if (!this.shadowRoot) {
      throw new Error('ShadowDomRenderer: not mounted. Call mount() first.');
    }

    const style = document.createElement('style');
    style.textContent = css;
    this.shadowRoot.insertBefore(style, this.shadowRoot.firstChild);
  }

  /**
   * Toggle sidebar visibility.
   */
  toggle(): void {
    if (this.hostElement) {
      const isVisible = this.hostElement.style.display !== 'none';
      this.hostElement.style.display = isVisible ? 'none' : '';
      // Adjust page layout to match sidebar visibility
      if (isVisible) {
        this.layoutStyleTag?.remove();
        this.layoutStyleTag = null;
      } else {
        this.injectLayoutCSS(this.currentWidth);
      }
    }
  }

  /**
   * Set the theme attribute on the host element.
   * This makes :host([data-theme="light"]) selectors work in theme.css.
   */
  setTheme(theme: 'dark' | 'light'): void {
    if (this.hostElement) {
      this.hostElement.setAttribute('data-theme', theme);
    }
  }

  /**
   * Set sidebar width.
   */
  setWidth(width: number): void {
    this.currentWidth = width;
    if (this.hostElement) {
      this.hostElement.style.width = `${width}px`;
      // Keep page layout in sync with sidebar width
      if (this.hostElement.style.display !== 'none') {
        this.injectLayoutCSS(width);
      }
    }
  }

  /**
   * Inject a <style> into the DA page (NOT shadow DOM) that squeezes
   * all DA layout elements to make room for the sidebar.
   *
   * DA uses position:fixed on its header and CSS Grid on its main
   * wrapper, so body margin-right alone isn't enough.
   */
  private injectLayoutCSS(width: number): void {
    // Remove previous tag if present (e.g. on resize)
    this.layoutStyleTag?.remove();

    const tag = document.createElement('style');
    tag.id = 'dsh-layout-squeeze';
    tag.textContent = `
      /* Prevent horizontal overflow */
      html, body {
        overflow-x: hidden !important;
      }
      /* Body margin — pushes static-flow content */
      body {
        margin-right: ${width}px !important;
      }
      /* DA's fixed header — constrain to available space */
      body > header {
        right: ${width}px !important;
        width: auto !important;
        overflow: hidden !important;
      }
      /* DA header flex items use flex:0 0 auto (won't shrink).
         Allow them to shrink so icons reflow within the boundary. */
      body > header > * {
        flex-shrink: 1 !important;
        min-width: 0 !important;
      }
      /* DA's main content wrapper — CSS Grid with fixed px columns
         (e.g. 172px 796px 0px). Make the content column flex while
         keeping the left nav at its natural width. */
      body > div:not(.ReactModalPortal):not(da-stash-helper) {
        max-width: calc(100vw - ${width}px) !important;
        grid-template-columns: 172px 1fr 0px !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(tag);
    this.layoutStyleTag = tag;

    // Nudge DA's responsive JS to recalculate layout
    window.dispatchEvent(new Event('resize'));
  }
}
