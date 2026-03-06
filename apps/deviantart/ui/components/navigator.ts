/**
 * Navigator — route-based page switcher.
 *
 * Replaces TabHost. Subscribes to state.currentRoute.
 * On route change: unmounts current page, mounts new one.
 * Shows back button + title header when not on dashboard.
 */

import { BaseComponent } from './base-component';
import type { IStore } from '../../core/state/store';
import type { Route } from '../../core/state/store.types';
import { actions } from '../../core/state/actions';

export interface PageDefinition {
  id: Route['page'];
  label: string;
  component: BaseComponent;
}

export class Navigator extends BaseComponent {
  private pages: Map<string, PageDefinition> = new Map();
  private navHeader: HTMLElement;
  private backButton: HTMLButtonElement;
  private titleText: HTMLSpanElement;
  private contentArea: HTMLElement;
  private activePageId: string = '';

  constructor() {
    super('div', 'dsh-navigator');

    // Navigation header (hidden on dashboard)
    this.navHeader = document.createElement('div');
    this.navHeader.className = 'dsh-nav-header';
    this.navHeader.style.cssText = `
      display: none;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--dsh-bg-secondary);
      border-bottom: 1px solid var(--dsh-border);
    `;

    this.backButton = document.createElement('button');
    this.backButton.className = 'dsh-back-btn';
    this.backButton.textContent = '\u2190';
    this.backButton.title = 'Back to Dashboard';
    this.backButton.style.cssText = `
      width: 28px;
      height: 28px;
      padding: 0;
      font-size: 16px;
      line-height: 28px;
      text-align: center;
      background: var(--dsh-bg-tertiary);
      color: var(--dsh-text-primary);
      border: 1px solid var(--dsh-border);
      border-radius: var(--dsh-radius-sm);
      cursor: pointer;
      flex-shrink: 0;
    `;

    this.titleText = document.createElement('span');
    this.titleText.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      color: var(--dsh-text-primary);
    `;

    this.navHeader.appendChild(this.backButton);
    this.navHeader.appendChild(this.titleText);

    this.contentArea = document.createElement('div');
    this.contentArea.className = 'dsh-nav-content';
    this.contentArea.style.cssText = 'padding: 12px;';
  }

  /**
   * Register all available pages.
   */
  setPages(pages: PageDefinition[]): this {
    for (const page of pages) {
      this.pages.set(page.id, page);
    }
    return this;
  }

  protected render(): void {
    this.el.appendChild(this.navHeader);
    this.el.appendChild(this.contentArea);
  }

  protected onMount(): void {
    // Back button → navigate to dashboard
    this.on(this.backButton, 'click', () => {
      this.store?.dispatch(actions.setRoute({ page: 'dashboard' }));
    });

    // Watch route changes
    this.watch(
      (state) => state.currentRoute,
      (route) => this.navigateTo(route),
    );
  }

  protected onUnmount(): void {
    // Unmount active page
    const activePage = this.pages.get(this.activePageId);
    if (activePage) {
      activePage.component.unmount();
    }
    this.activePageId = '';
  }

  private navigateTo(route: Route): void {
    const pageId = route.page;

    // Skip if already on this page
    if (pageId === this.activePageId) return;

    // Unmount current page
    const currentPage = this.pages.get(this.activePageId);
    if (currentPage) {
      currentPage.component.unmount();
    }

    // Clear content area
    while (this.contentArea.firstChild) {
      this.contentArea.removeChild(this.contentArea.firstChild);
    }

    this.activePageId = pageId;

    // Update nav header visibility
    if (pageId === 'dashboard') {
      this.navHeader.style.display = 'none';
    } else {
      this.navHeader.style.display = 'flex';
      const pageDef = this.pages.get(pageId);
      this.titleText.textContent = pageDef?.label ?? pageId;
    }

    // Mount new page
    const nextPage = this.pages.get(pageId);
    if (nextPage) {
      if (this.store) {
        nextPage.component.setStore(this.store);
      }
      nextPage.component.mount(this.contentArea);
    }
  }
}
