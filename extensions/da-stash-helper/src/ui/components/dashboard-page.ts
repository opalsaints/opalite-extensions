/**
 * DashboardPage — hub page with feature cards.
 *
 * Shows quick stats (total items, selected count) and
 * clickable cards for each feature (Schedule, Tier, Edit).
 * Clicking a card dispatches SET_ROUTE to navigate.
 */

import { BaseComponent } from './base-component';
import { actions } from '../../core/state/actions';
import type { Route, OperationRecord, StashState } from '../../core/state/store.types';
import type { FolderNode } from '../../shared/types';
import type { IEventBus } from '../../core/events/event-bus';
import type { EventMap } from '../../core/events/event-types';

interface FeatureCard {
  id: Route['page'];
  title: string;
  description: string;
  icon: string;
}

const FEATURES: FeatureCard[] = [
  {
    id: 'schedule',
    title: 'Schedule',
    description: 'Schedule stash items for timed publishing',
    icon: 'schedule',
  },
  {
    id: 'tier',
    title: 'Tier',
    description: 'Assign subscription tiers to deviations',
    icon: 'tier',
  },
  {
    id: 'edit',
    title: 'Bulk Edit',
    description: 'Edit titles and descriptions with templates',
    icon: 'edit',
  },
];

/** Simple inline SVG icons — no emoji. */
function createSvgIcon(type: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'width: 28px; height: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: rgba(0, 229, 155, 0.12);';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'var(--dsh-accent)');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const NS = 'http://www.w3.org/2000/svg';
  if (type === 'schedule') {
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', '2'); rect.setAttribute('y', '3');
    rect.setAttribute('width', '12'); rect.setAttribute('height', '11');
    rect.setAttribute('rx', '1.5');
    const l1 = document.createElementNS(NS, 'line');
    l1.setAttribute('x1', '2'); l1.setAttribute('y1', '6.5');
    l1.setAttribute('x2', '14'); l1.setAttribute('y2', '6.5');
    const l2 = document.createElementNS(NS, 'line');
    l2.setAttribute('x1', '5.5'); l2.setAttribute('y1', '1.5');
    l2.setAttribute('x2', '5.5'); l2.setAttribute('y2', '4');
    const l3 = document.createElementNS(NS, 'line');
    l3.setAttribute('x1', '10.5'); l3.setAttribute('y1', '1.5');
    l3.setAttribute('x2', '10.5'); l3.setAttribute('y2', '4');
    svg.append(rect, l1, l2, l3);
  } else if (type === 'tier') {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M8 1.5l1.85 3.75 4.15.6-3 2.93.71 4.12L8 10.87 4.29 12.9l.71-4.12-3-2.93 4.15-.6z');
    svg.appendChild(path);
  } else if (type === 'edit') {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M11.5 1.5l3 3-9 9H2.5v-3z');
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', '9'); line.setAttribute('y1', '4');
    line.setAttribute('x2', '12'); line.setAttribute('y2', '7');
    svg.append(path, line);
  }

  wrapper.appendChild(svg);
  return wrapper;
}

export class DashboardPage extends BaseComponent {
  private statsBar: HTMLElement;
  private inventoryRow: HTMLElement;
  private folderTreeSection: HTMLElement;
  private cardsContainer: HTMLElement;
  private historySection: HTMLElement;
  private historyList: HTMLElement;
  private badgeElements: Map<string, HTMLElement> = new Map();
  private eventBus: IEventBus<EventMap> | null = null;
  private allItemsValueEl: HTMLElement | null = null;
  private folderViewMode: 'list' | 'diagram' = 'diagram';
  private cachedTree: FolderNode[] | undefined;

  constructor() {
    super('div', 'dsh-dashboard');

    this.statsBar = document.createElement('div');
    this.statsBar.style.cssText = `
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    `;

    this.inventoryRow = document.createElement('div');
    this.inventoryRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      margin-bottom: 12px;
      font-size: 11px;
      color: var(--dsh-text-secondary);
    `;

    this.folderTreeSection = document.createElement('div');
    this.folderTreeSection.style.cssText = 'margin-bottom: 12px; display: none;';

    this.cardsContainer = document.createElement('div');
    this.cardsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    this.historySection = document.createElement('div');
    this.historySection.style.cssText = 'margin-top: 16px;';

    this.historyList = document.createElement('div');
    this.historyList.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
  }

  setEventBus(eventBus: IEventBus<EventMap>): void {
    this.eventBus = eventBus;
  }

  protected render(): void {
    // Clear persistent sub-containers to prevent duplication on re-mount
    while (this.cardsContainer.firstChild) this.cardsContainer.removeChild(this.cardsContainer.firstChild);
    while (this.historySection.firstChild) this.historySection.removeChild(this.historySection.firstChild);
    this.badgeElements.clear();

    // Stats bar
    this.el.appendChild(this.statsBar);

    // Inventory row (scan info + button)
    this.el.appendChild(this.inventoryRow);

    // Feature cards (operations)
    for (const feature of FEATURES) {
      const card = this.createCard(feature);
      this.cardsContainer.appendChild(card);
    }
    this.el.appendChild(this.cardsContainer);

    // Folder tree section (below operations, shown when folder data is available)
    this.el.appendChild(this.folderTreeSection);

    // History section
    const historyTitle = document.createElement('div');
    historyTitle.textContent = 'Recent Operations';
    historyTitle.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--dsh-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;';
    this.historySection.appendChild(historyTitle);
    this.historySection.appendChild(this.historyList);
    this.el.appendChild(this.historySection);
  }

  protected onMount(): void {
    // Watch directory total (totalItems = all paginated pages in current dir)
    this.watch(
      (state) => state.pageInfo.totalItems,
      (dirTotal) => {
        const selected = this.store?.getState().selectedIds.length ?? 0;
        this.updateStats(dirTotal, selected);
      },
    );

    // Watch selection count
    this.watch(
      (state) => state.selectedIds.length,
      (selected) => {
        const dirTotal = this.store?.getState().pageInfo.totalItems ?? 0;
        this.updateStats(dirTotal, selected);
        this.updateBadges(selected);
      },
    );

    // Watch operation history
    this.watch(
      (state) => state.operationHistory,
      (history) => this.updateHistory(history),
    );

    // Watch inventory cache
    this.watch(
      (state) => state.inventoryCache,
      (cache) => this.updateInventoryRow(cache),
    );

    // Watch folder tree in inventory cache
    this.watch(
      (state) => state.inventoryCache?.folderTree,
      (tree) => this.updateFolderTree(tree),
    );
  }

  private createCard(feature: FeatureCard): HTMLElement {
    const card = document.createElement('div');
    card.className = 'dsh-feature-card';
    card.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--dsh-bg-secondary);
      border: 1px solid var(--dsh-border);
      border-radius: var(--dsh-radius-md);
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    `;

    // Hover effect
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--dsh-accent)';
      card.style.background = 'var(--dsh-bg-tertiary)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--dsh-border)';
      card.style.background = 'var(--dsh-bg-secondary)';
    });

    // Click → navigate
    this.on(card, 'click', () => {
      this.store?.dispatch(actions.setRoute({ page: feature.id }));
    });

    // Icon (SVG, no emoji)
    const icon = createSvgIcon(feature.icon);

    // Text container
    const textContainer = document.createElement('div');
    textContainer.style.cssText = 'flex: 1; min-width: 0;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size: 14px; font-weight: 600; color: var(--dsh-text-primary);';
    title.textContent = feature.title;

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size: 11px; color: var(--dsh-text-secondary); margin-top: 2px;';
    desc.textContent = feature.description;

    textContainer.appendChild(title);
    textContainer.appendChild(desc);

    // Badge (shows selected count)
    const badge = document.createElement('span');
    badge.style.cssText = `
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      background: rgba(0, 229, 155, 0.15);
      color: var(--dsh-accent);
      flex-shrink: 0;
      display: none;
    `;
    this.badgeElements.set(feature.id, badge);

    card.appendChild(icon);
    card.appendChild(textContainer);
    card.appendChild(badge);

    return card;
  }

  private updateStats(total: number, selected: number): void {
    while (this.statsBar.firstChild) {
      this.statsBar.removeChild(this.statsBar.firstChild);
    }

    const createStat = (value: string | number, label: string, color: string) => {
      const stat = document.createElement('div');
      stat.style.cssText = `
        flex: 1;
        padding: 10px;
        background: var(--dsh-bg-secondary);
        border: 1px solid var(--dsh-border);
        border-radius: var(--dsh-radius-md);
        text-align: center;
      `;

      const valueEl = document.createElement('div');
      valueEl.style.cssText = `font-size: 20px; font-weight: 700; color: ${color};`;
      valueEl.textContent = String(value);

      const labelEl = document.createElement('div');
      labelEl.style.cssText = 'font-size: 10px; color: var(--dsh-text-secondary); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px;';
      labelEl.textContent = label;

      stat.appendChild(valueEl);
      stat.appendChild(labelEl);
      return stat;
    };

    this.statsBar.appendChild(createStat(total, 'This Dir', 'var(--dsh-text-primary)'));
    this.statsBar.appendChild(createStat(selected, 'Selected', selected > 0 ? 'var(--dsh-accent)' : 'var(--dsh-text-secondary)'));

    const cache = this.store?.getState().inventoryCache;
    let allCount = cache?.totalWithFolders ?? cache?.count;
    // ALL ITEMS must never be less than THIS DIR (safeguard against stale cache)
    if (allCount != null && allCount < total) allCount = total;
    const allItemsStat = createStat(allCount != null ? allCount : '\u2014', 'All Items', allCount != null ? 'var(--dsh-accent)' : 'var(--dsh-text-secondary)');
    this.allItemsValueEl = allItemsStat.querySelector('div') as HTMLElement;
    this.statsBar.appendChild(allItemsStat);
  }

  private updateBadges(selected: number): void {
    for (const [, badge] of this.badgeElements) {
      if (selected > 0) {
        badge.textContent = `${selected} items`;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  private updateInventoryRow(cache: StashState['inventoryCache']): void {
    while (this.inventoryRow.firstChild) this.inventoryRow.removeChild(this.inventoryRow.firstChild);

    const infoText = document.createElement('span');
    if (cache) {
      infoText.textContent = `Last scan: ${relativeTime(cache.lastScan)}`;
    } else {
      infoText.textContent = 'Inventory not scanned';
    }

    const scanBtn = document.createElement('button');
    scanBtn.textContent = 'Scan Now';
    scanBtn.style.cssText = `
      padding: 3px 10px;
      font-size: 10px;
      background: var(--dsh-bg-tertiary);
      color: var(--dsh-text-secondary);
      border: 1px solid var(--dsh-border);
      border-radius: var(--dsh-radius-sm);
      cursor: pointer;
    `;
    this.on(scanBtn, 'click', () => {
      this.eventBus?.emit('command:scan-all-pages', undefined);
      scanBtn.textContent = 'Scanning...';
      scanBtn.style.opacity = '0.6';
      scanBtn.style.pointerEvents = 'none';
    });

    this.inventoryRow.appendChild(infoText);
    this.inventoryRow.appendChild(scanBtn);

    // Also update the "All Items" stat if it exists
    if (this.allItemsValueEl && cache) {
      this.allItemsValueEl.textContent = String(cache.totalWithFolders ?? cache.count);
      this.allItemsValueEl.style.color = 'var(--dsh-accent)';
    }
  }

  /** Recursively sum itemCount for a node and all descendants. */
  private totalItemCount(node: FolderNode): number {
    let total = node.itemCount;
    for (const child of node.children) {
      total += this.totalItemCount(child);
    }
    return total;
  }

  private updateFolderTree(tree?: FolderNode[]): void {
    this.cachedTree = tree;
    this.renderFolderView();
  }

  private renderFolderView(): void {
    const tree = this.cachedTree;
    while (this.folderTreeSection.firstChild) {
      this.folderTreeSection.removeChild(this.folderTreeSection.firstChild);
    }

    if (!tree || tree.length === 0) {
      this.folderTreeSection.style.display = 'none';
      return;
    }

    this.folderTreeSection.style.display = '';

    // Header row with title + view toggle
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;';

    const heading = document.createElement('div');
    heading.textContent = 'Folders';
    heading.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--dsh-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;';

    const toggleBtn = document.createElement('button');
    toggleBtn.style.cssText = 'background: none; border: 1px solid var(--dsh-border); border-radius: 4px; padding: 2px 6px; font-size: 9px; color: var(--dsh-text-secondary); cursor: pointer; text-transform: uppercase; letter-spacing: 0.3px;';
    toggleBtn.textContent = this.folderViewMode === 'diagram' ? 'List' : 'Diagram';
    toggleBtn.title = `Switch to ${this.folderViewMode === 'diagram' ? 'list' : 'diagram'} view`;
    toggleBtn.addEventListener('click', () => {
      this.folderViewMode = this.folderViewMode === 'diagram' ? 'list' : 'diagram';
      this.renderFolderView();
    });

    headerRow.appendChild(heading);
    headerRow.appendChild(toggleBtn);
    this.folderTreeSection.appendChild(headerRow);

    if (this.folderViewMode === 'list') {
      this.renderListView(tree);
    } else {
      this.renderDiagramView(tree);
    }
  }

  // ── List View (text-based with connector lines) ──

  private renderListView(tree: FolderNode[]): void {
    const treeContainer = document.createElement('div');
    treeContainer.style.cssText = 'font-size: 11px; line-height: 1;';

    const renderNode = (node: FolderNode, prefix: string[], isLast: boolean, isRoot: boolean) => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; height: 22px;';

      if (!isRoot) {
        const connectorSpan = document.createElement('span');
        connectorSpan.style.cssText = 'color: var(--dsh-accent); white-space: pre; font-family: monospace; font-size: 12px; flex-shrink: 0;';
        const branch = isLast ? '\u2514\u2500 ' : '\u251C\u2500 ';
        connectorSpan.textContent = prefix.join('') + branch;
        row.appendChild(connectorSpan);
      }

      const name = document.createElement('span');
      name.textContent = node.name;
      name.style.cssText = 'flex: 1; color: var(--dsh-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      row.appendChild(name);

      row.appendChild(this.createCountLabel(node));
      treeContainer.appendChild(row);

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const childIsLast = i === node.children.length - 1;
        const nextPrefix = isRoot ? [] : [...prefix, isLast ? '   ' : '\u2502  '];
        renderNode(child, nextPrefix, childIsLast, false);
      }
    };

    for (let i = 0; i < tree.length; i++) {
      renderNode(tree[i], [], i === tree.length - 1, true);
    }

    this.folderTreeSection.appendChild(treeContainer);
  }

  // ── Diagram View (horizontal tree, auto-scaled to fit) ──

  private renderDiagramView(tree: FolderNode[]): void {
    // Outer wrapper clips overflow and enables horizontal scroll as fallback
    const outer = document.createElement('div');
    outer.className = 'dsh-tree-wrap';

    // Inner container holds the actual tree at natural size.
    // After mounting we measure it and apply transform: scale() to fit.
    const inner = document.createElement('div');
    inner.className = 'dsh-tree-inner';

    // Root row — centers multiple root nodes
    const rootRow = document.createElement('div');
    rootRow.className = 'dsh-tree-children';
    rootRow.style.justifyContent = 'center';

    for (const rootNode of tree) {
      const group = this.buildTreeNode(rootNode);
      rootRow.appendChild(group);
    }

    inner.appendChild(rootRow);
    outer.appendChild(inner);
    this.folderTreeSection.appendChild(outer);

    // Auto-scale: measure the tree's natural width vs available width
    requestAnimationFrame(() => {
      const availW = outer.clientWidth;
      const naturalW = inner.scrollWidth;
      if (naturalW > availW && naturalW > 0) {
        const scale = Math.max(availW / naturalW, 0.45); // don't shrink below 45%
        inner.style.transform = `scale(${scale})`;
        inner.style.transformOrigin = 'top center';
        // Adjust outer height to match scaled height
        const naturalH = inner.scrollHeight;
        outer.style.height = `${Math.ceil(naturalH * scale) + 4}px`;
      }
    });
  }

  /** Recursively build a horizontal tree node with CSS connector lines. */
  private buildTreeNode(node: FolderNode): HTMLElement {
    const group = document.createElement('div');
    group.className = 'dsh-tree-group';

    // Node box
    const totalWithSubs = this.totalItemCount(node);
    const hasItems = node.itemCount > 0 || totalWithSubs > 0;

    const nodeBox = document.createElement('div');
    nodeBox.className = `dsh-tree-node${hasItems ? ' has-items' : ''}`;

    const nameEl = document.createElement('div');
    nameEl.className = 'dsh-tree-node-name';
    nameEl.textContent = node.name;
    nameEl.title = node.name;

    const countEl = document.createElement('div');
    countEl.className = 'dsh-tree-node-count';

    if (node.children.length > 0 && totalWithSubs !== node.itemCount) {
      const ownSpan = document.createElement('span');
      ownSpan.textContent = String(node.itemCount);
      ownSpan.style.color = 'var(--dsh-text-secondary)';

      const sepSpan = document.createElement('span');
      sepSpan.textContent = ' / ';
      sepSpan.style.color = 'var(--dsh-text-muted)';

      const totalSpan = document.createElement('span');
      totalSpan.textContent = String(totalWithSubs);
      totalSpan.style.color = 'var(--dsh-accent)';

      countEl.appendChild(ownSpan);
      countEl.appendChild(sepSpan);
      countEl.appendChild(totalSpan);
    } else {
      countEl.textContent = String(node.itemCount);
      countEl.style.color = node.itemCount > 0 ? 'var(--dsh-accent)' : 'var(--dsh-text-muted)';
    }

    nodeBox.appendChild(nameEl);
    nodeBox.appendChild(countEl);
    group.appendChild(nodeBox);

    // Children
    if (node.children.length > 0) {
      // Vertical line from parent down
      const vline = document.createElement('div');
      vline.className = 'dsh-tree-vline';
      group.appendChild(vline);

      // Children row
      const childrenRow = document.createElement('div');
      childrenRow.className = 'dsh-tree-children';

      for (const child of node.children) {
        const childWrapper = document.createElement('div');
        childWrapper.className = 'dsh-tree-child';

        // Vertical line from horizontal connector down to child node
        const childVline = document.createElement('div');
        childVline.className = 'dsh-tree-vline';
        childWrapper.appendChild(childVline);

        // Recursive child subtree
        const childGroup = this.buildTreeNode(child);
        childWrapper.appendChild(childGroup);

        childrenRow.appendChild(childWrapper);
      }

      group.appendChild(childrenRow);
    }

    return group;
  }

  /** Create a count label element for list view. */
  private createCountLabel(node: FolderNode): HTMLElement {
    const countEl = document.createElement('span');
    countEl.style.cssText = 'flex-shrink: 0; margin-left: 8px; font-size: 10px; font-family: monospace;';
    const totalWithSubs = this.totalItemCount(node);

    if (node.children.length > 0 && totalWithSubs !== node.itemCount) {
      const ownSpan = document.createElement('span');
      ownSpan.textContent = String(node.itemCount);
      ownSpan.style.color = 'var(--dsh-text-secondary)';

      const sepSpan = document.createElement('span');
      sepSpan.textContent = ' / ';
      sepSpan.style.color = 'var(--dsh-text-muted)';

      const totalSpan = document.createElement('span');
      totalSpan.textContent = String(totalWithSubs);
      totalSpan.style.color = 'var(--dsh-accent)';
      totalSpan.title = 'Including subfolders';

      countEl.appendChild(ownSpan);
      countEl.appendChild(sepSpan);
      countEl.appendChild(totalSpan);
    } else {
      countEl.textContent = String(node.itemCount);
      countEl.style.color = node.itemCount > 0 ? 'var(--dsh-text-secondary)' : 'var(--dsh-text-muted)';
    }
    return countEl;
  }

  private updateHistory(history: OperationRecord[]): void {
    while (this.historyList.firstChild) {
      this.historyList.removeChild(this.historyList.firstChild);
    }

    if (history.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size: 11px; color: var(--dsh-text-secondary); padding: 8px;';
      empty.textContent = 'No operations yet';
      this.historyList.appendChild(empty);
      return;
    }

    const recent = history.slice(0, 5);
    for (const record of recent) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        background: var(--dsh-bg-secondary);
        border: 1px solid var(--dsh-border);
        border-radius: var(--dsh-radius-sm);
        font-size: 11px;
      `;

      // Type badge
      const typeBadge = document.createElement('span');
      typeBadge.textContent = record.type;
      typeBadge.style.cssText = `
        padding: 1px 6px;
        border-radius: 8px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        background: rgba(0, 229, 155, 0.15);
        color: var(--dsh-accent);
        flex-shrink: 0;
      `;

      // Result text
      const resultText = document.createElement('span');
      resultText.style.cssText = 'flex: 1; color: var(--dsh-text-tertiary);';
      const parts = [`${record.processed} done`];
      if (record.failed > 0) parts.push(`${record.failed} failed`);
      resultText.textContent = parts.join(', ');

      // Status indicator
      const status = document.createElement('span');
      status.textContent = record.success ? '\u2713' : '\u2717';
      status.style.cssText = record.success
        ? 'color: var(--dsh-success); font-weight: 700;'
        : 'color: var(--dsh-error); font-weight: 700;';

      // Relative time
      const timeText = document.createElement('span');
      timeText.style.cssText = 'color: var(--dsh-text-secondary); font-size: 10px; flex-shrink: 0;';
      timeText.textContent = relativeTime(record.timestamp);

      row.appendChild(typeBadge);
      row.appendChild(resultText);
      row.appendChild(status);
      row.appendChild(timeText);
      this.historyList.appendChild(row);
    }
  }
}

/** Format a timestamp as a relative time string (e.g., "2m ago", "1h ago"). */
function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
