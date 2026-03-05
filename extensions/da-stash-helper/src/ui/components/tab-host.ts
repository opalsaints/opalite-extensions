/**
 * TabHost — container with tab switching.
 *
 * Manages a set of named tabs, showing one at a time.
 * Each tab is a BaseComponent that gets mounted/unmounted as needed.
 */

import { BaseComponent } from './base-component';

export interface TabDefinition {
  id: string;
  label: string;
  component: BaseComponent;
}

export class TabHost extends BaseComponent {
  private tabs: TabDefinition[] = [];
  private activeTabId = '';
  private tabBar: HTMLElement;
  private tabContent: HTMLElement;
  private tabBarCleanup: Array<() => void> = [];

  constructor() {
    super('div', 'dsh-tab-host');
    this.tabBar = document.createElement('div');
    this.tabBar.className = 'dsh-tab-bar';
    this.tabContent = document.createElement('div');
    this.tabContent.className = 'dsh-tab-content';
  }

  /**
   * Add tabs to the host.
   */
  setTabs(tabs: TabDefinition[]): this {
    this.tabs = tabs;
    if (tabs.length > 0 && !this.activeTabId) {
      this.activeTabId = tabs[0].id;
    }
    return this;
  }

  /**
   * Switch to a tab by ID.
   */
  switchTo(tabId: string): void {
    if (tabId === this.activeTabId) return;

    // Unmount current tab's component
    const currentTab = this.tabs.find((t) => t.id === this.activeTabId);
    if (currentTab) {
      currentTab.component.unmount();
    }

    this.activeTabId = tabId;
    this.renderTabBar();
    this.renderActiveTab();
  }

  protected render(): void {
    this.el.appendChild(this.tabBar);
    this.el.appendChild(this.tabContent);
    this.renderTabBar();
    this.renderActiveTab();
  }

  private renderTabBar(): void {
    // Clean up previous button listeners before re-rendering
    for (const cleanup of this.tabBarCleanup) cleanup();
    this.tabBarCleanup = [];

    // Clear existing buttons
    while (this.tabBar.firstChild) {
      this.tabBar.removeChild(this.tabBar.firstChild);
    }

    for (const tab of this.tabs) {
      const button = document.createElement('button');
      button.className = `dsh-tab-button${tab.id === this.activeTabId ? ' active' : ''}`;
      button.textContent = tab.label;
      button.dataset.tabId = tab.id;

      const handler = () => this.switchTo(tab.id);
      button.addEventListener('click', handler);
      this.tabBarCleanup.push(() => button.removeEventListener('click', handler));

      this.tabBar.appendChild(button);
    }
  }

  private renderActiveTab(): void {
    // Clear content area
    while (this.tabContent.firstChild) {
      this.tabContent.removeChild(this.tabContent.firstChild);
    }

    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);
    if (activeTab) {
      // Pass store to the tab component if we have one
      if (this.store) {
        activeTab.component.setStore(this.store);
      }
      activeTab.component.mount(this.tabContent);
    }
  }

  protected onUnmount(): void {
    // Clean up tab bar listeners
    for (const cleanup of this.tabBarCleanup) cleanup();
    this.tabBarCleanup = [];

    // Unmount the active tab's component
    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);
    if (activeTab) {
      activeTab.component.unmount();
    }
  }
}
