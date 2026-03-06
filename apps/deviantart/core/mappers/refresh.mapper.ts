/**
 * RefreshMapper — user-triggered rescan with diff reporting.
 *
 * Performs a full rescan of the current page and computes
 * a diff against the previous state (added/removed/modified items).
 * Emits mapper:refresh-complete with the diff for UI feedback.
 */

import type { IMapper, MapperContext } from './mapper.interface';
import type { StashItem } from '../state/store.types';
import type { MapperDiff } from '../events/event-types';
import { ITEM_SELECTORS, PATTERNS } from '../dom/selectors';
import { actions } from '../state/actions';

export class RefreshMapper implements IMapper {
  readonly id = 'refresh';
  readonly type = 'refresh' as const;

  private context!: MapperContext;

  async init(context: MapperContext): Promise<void> {
    this.context = context;
    context.logger.info('RefreshMapper initialized', 'RefreshMapper');
  }

  async scan(): Promise<void> {
    const { store, eventBus, logger } = this.context;

    const oldItems = store.getState().items;
    const oldMap = new Map(oldItems.map((item) => [item.id, item]));

    // Re-extract items from DOM
    const newItems = this.extractItems();
    const newMap = new Map(newItems.map((item) => [item.id, item]));

    // Compute diff
    const added: StashItem[] = [];
    const removed: string[] = [];
    const modified: StashItem[] = [];

    // Find added and modified
    for (const [id, newItem] of newMap) {
      const oldItem = oldMap.get(id);
      if (!oldItem) {
        added.push(newItem);
      } else if (this.hasChanged(oldItem, newItem)) {
        modified.push(newItem);
      }
    }

    // Find removed
    for (const [id] of oldMap) {
      if (!newMap.has(id)) {
        removed.push(id);
      }
    }

    const diff: MapperDiff = { added, removed, modified };

    // Update store with new items
    store.dispatch(actions.setItems(newItems));

    // Re-extract selection
    const selectedIds = this.extractSelection();
    store.dispatch(actions.setSelection(selectedIds));

    // Emit diff
    eventBus.emit('mapper:refresh-complete', { diff });

    logger.info(
      `Refresh complete: ${added.length} added, ${removed.length} removed, ${modified.length} modified`,
      'RefreshMapper',
    );
  }

  destroy(): void {
    this.context?.logger.debug('RefreshMapper destroyed', 'RefreshMapper');
  }

  // ── Private Methods (mirrors PageStateMapper extraction) ──

  private extractItems(): StashItem[] {
    const items: StashItem[] = [];
    const checkboxes = document.querySelectorAll(ITEM_SELECTORS.checkbox);

    for (let i = 0; i < checkboxes.length; i++) {
      const checkbox = checkboxes[i] as HTMLInputElement;
      const item = this.parseItemFromCheckbox(checkbox);
      if (item) items.push(item);
    }

    return items;
  }

  private parseItemFromCheckbox(checkbox: HTMLInputElement): StashItem | null {
    const container = checkbox.closest('li') ?? checkbox.parentElement;
    if (!container) return null;

    const stashLink = container.querySelector(ITEM_SELECTORS.itemLink) as HTMLAnchorElement | null;
    if (!stashLink) {
      const folderLink = container.querySelector(ITEM_SELECTORS.folderLink) as HTMLAnchorElement | null;
      if (folderLink) {
        const urlMatch = folderLink.href.match(/\/stash\/(2[a-z0-9]+)/i);
        if (!urlMatch) return null;
        return {
          id: urlMatch[1],
          title: folderLink.textContent?.trim() || 'Untitled Folder',
          stashUrl: folderLink.href,
          type: 'folder',
          selected: checkbox.checked,
        };
      }
      return null;
    }

    const urlMatch = stashLink.href.match(/\/stash\/(0[a-z0-9]+)/i);
    if (!urlMatch) return null;

    const img = container.querySelector('img') as HTMLImageElement | null;
    const title = img?.alt || stashLink.textContent?.trim() || 'Untitled';

    const tagElements = container.querySelectorAll(ITEM_SELECTORS.tag);
    const tags: string[] = [];
    for (let i = 0; i < tagElements.length; i++) {
      const tagName = tagElements[i].getAttribute('data-tagname');
      if (tagName) tags.push(tagName);
    }

    const labels = this.extractLabels(container);

    return {
      id: urlMatch[1],
      title,
      thumbnailUrl: img?.src,
      stashUrl: stashLink.href,
      type: 'file',
      selected: checkbox.checked,
      tags: tags.length > 0 ? tags : undefined,
      labels: labels.length > 0 ? labels : undefined,
    };
  }

  private extractLabels(container: Element): string[] {
    const labels: string[] = [];
    const text = container.textContent ?? '';
    if (text.includes('NoAI')) labels.push('NoAI');
    if (text.includes('AI-Generated') || text.includes('Created using AI')) labels.push('AI-Generated');
    if (text.includes('Mature')) labels.push('Mature');
    return labels;
  }

  private extractSelection(): string[] {
    const selectedIds: string[] = [];
    const checkboxes = document.querySelectorAll(ITEM_SELECTORS.checkbox) as NodeListOf<HTMLInputElement>;

    for (let i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) {
        const container = checkboxes[i].closest('li') ?? checkboxes[i].parentElement;
        if (!container) continue;

        const link = container.querySelector(ITEM_SELECTORS.itemLink) as HTMLAnchorElement | null
          ?? container.querySelector(ITEM_SELECTORS.folderLink) as HTMLAnchorElement | null;

        if (link) {
          const match = link.href.match(/\/stash\/([0-9a-z]+)/i);
          if (match) selectedIds.push(match[1]);
        }
      }
    }

    return selectedIds;
  }

  private hasChanged(oldItem: StashItem, newItem: StashItem): boolean {
    return (
      oldItem.title !== newItem.title ||
      oldItem.selected !== newItem.selected ||
      oldItem.thumbnailUrl !== newItem.thumbnailUrl ||
      JSON.stringify(oldItem.tags) !== JSON.stringify(newItem.tags) ||
      JSON.stringify(oldItem.labels) !== JSON.stringify(newItem.labels)
    );
  }
}
