/**
 * ItemCounter — displays selected/total item count.
 *
 * Shows "5 of 50 selected" with reactive updates from the store.
 */

import { BaseComponent } from './base-component';

export class ItemCounter extends BaseComponent {
  private countText: HTMLSpanElement;
  private pageText: HTMLSpanElement;

  constructor() {
    super('div', 'dsh-item-counter');

    this.countText = document.createElement('span');
    this.countText.className = 'dsh-count-text';

    this.pageText = document.createElement('span');
    this.pageText.className = 'dsh-page-text';
  }

  protected render(): void {
    this.el.appendChild(this.countText);
    this.el.appendChild(this.pageText);

    // Initial values
    this.updateCount(0, 0);
    this.updatePage(1, 1, 0);
  }

  protected onMount(): void {
    // Watch selection count — store.subscribe() now delivers initial value immediately
    this.watch(
      (state) => ({ selected: state.selectedIds.length, total: state.items.length }),
      ({ selected, total }) => this.updateCount(selected, total),
    );

    // Watch page info
    this.watch(
      (state) => state.pageInfo,
      (pageInfo) => this.updatePage(pageInfo.currentPage, pageInfo.totalPages, pageInfo.totalItems),
    );
  }

  private updateCount(selected: number, total: number): void {
    if (selected > 0) {
      this.countText.textContent = `${selected} of ${total} selected`;
      this.countText.style.color = 'var(--dsh-accent)';
    } else {
      this.countText.textContent = `${total} items`;
      this.countText.style.color = 'var(--dsh-text-secondary)';
    }
  }

  private updatePage(current: number, total: number, totalItems: number): void {
    if (total > 1) {
      this.pageText.textContent = ` · Page ${current}/${total} (${totalItems} total)`;
    } else if (totalItems > 0) {
      this.pageText.textContent = ` · ${totalItems} total`;
    } else {
      this.pageText.textContent = '';
    }
  }
}
