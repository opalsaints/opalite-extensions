/**
 * PageStateMapper — captures current page items, selection, and pagination.
 *
 * Runs on every stash page load / SPA navigation.
 * Extracts data from the live DOM using selectors from DA_STASH_STRUCTURE.json.
 */

import type { IMapper, MapperContext } from './mapper.interface';
import type { StashItem, PageInfo } from '../state/store.types';
import { ITEM_SELECTORS, PATTERNS } from '../dom/selectors';
import { detectPageType } from '../dom/page-detector';
import { actions } from '../state/actions';

export class PageStateMapper implements IMapper {
  readonly id = 'page-state';
  readonly type = 'page-state' as const;

  private context!: MapperContext;

  async init(context: MapperContext): Promise<void> {
    this.context = context;
    context.logger.info('PageStateMapper initialized', 'PageStateMapper');

    // Run initial scan
    await this.scan();
  }

  async scan(): Promise<void> {
    const { store, eventBus, logger } = this.context;

    try {
      const items = this.extractItems();
      const selectedIds = this.extractSelection();
      const pageInfo = this.extractPageInfo();

      // Update store
      store.dispatch(actions.setItems(items));
      store.dispatch(actions.setSelection(selectedIds));
      store.dispatch(actions.setPageInfo(pageInfo));

      // Emit event for other modules
      eventBus.emit('mapper:page-state-updated', { items, pageInfo });
      eventBus.emit('mapper:selection-changed', { selectedIds });

      logger.info(
        `Scanned: ${items.length} items, ${selectedIds.length} selected, page ${pageInfo.currentPage}/${pageInfo.totalPages}`,
        'PageStateMapper',
      );
    } catch (err) {
      logger.error(`Scan failed: ${err}`, 'PageStateMapper');
    }
  }

  destroy(): void {
    this.context?.logger.debug('PageStateMapper destroyed', 'PageStateMapper');
  }

  // ── Private Extraction Methods ──

  private extractItems(): StashItem[] {
    const items: StashItem[] = [];
    const checkboxes = document.querySelectorAll(ITEM_SELECTORS.checkbox);

    for (let i = 0; i < checkboxes.length; i++) {
      const checkbox = checkboxes[i] as HTMLInputElement;
      const item = this.parseItemFromCheckbox(checkbox);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  private parseItemFromCheckbox(checkbox: HTMLInputElement): StashItem | null {
    // Walk up to find the item container (li in list mode, or parent div in grid)
    const container = checkbox.closest('li') ?? checkbox.parentElement;
    if (!container) return null;

    // Find stash link to get ID
    const stashLink = container.querySelector(ITEM_SELECTORS.itemLink) as HTMLAnchorElement | null;
    if (!stashLink) {
      // Could be a folder link instead
      const folderLink = container.querySelector(ITEM_SELECTORS.folderLink) as HTMLAnchorElement | null;
      if (folderLink) {
        return this.parseFolderItem(folderLink, checkbox, container);
      }
      return null;
    }

    // Extract stash ID from URL (e.g., /stash/0abc123 → 0abc123)
    const urlMatch = stashLink.href.match(/\/stash\/(0[a-z0-9]+)/i);
    if (!urlMatch) return null;

    const id = urlMatch[1];

    // Extract title from img alt or link text
    const img = container.querySelector('img') as HTMLImageElement | null;
    const title = img?.alt || stashLink.textContent?.trim() || 'Untitled';

    // Extract thumbnail
    const thumbnailUrl = img?.src;

    // Extract tags
    const tagElements = container.querySelectorAll(ITEM_SELECTORS.tag);
    const tags: string[] = [];
    for (let i = 0; i < tagElements.length; i++) {
      const tagName = tagElements[i].getAttribute('data-tagname');
      if (tagName) tags.push(tagName);
    }

    // Extract labels (NoAI, AI-Generated, Mature)
    const labels = this.extractLabels(container);

    // Extract date — check for scheduled date (has time component like "09:00 AM")
    const dateText = container.textContent ?? '';
    const scheduledMatch = dateText.match(PATTERNS.scheduledDateWithTime);
    const dateMatch = dateText.match(PATTERNS.itemDate);
    const dateAdded = dateMatch?.[0];
    const scheduledDate = scheduledMatch?.[0];

    return {
      id,
      title,
      thumbnailUrl,
      stashUrl: stashLink.href,
      type: 'file',
      selected: checkbox.checked,
      tags: tags.length > 0 ? tags : undefined,
      labels: labels.length > 0 ? labels : undefined,
      dateAdded,
      scheduledDate,
    };
  }

  private parseFolderItem(
    folderLink: HTMLAnchorElement,
    checkbox: HTMLInputElement,
    container: Element,
  ): StashItem | null {
    const urlMatch = folderLink.href.match(/\/stash\/(2[a-z0-9]+)/i);
    if (!urlMatch) return null;

    const id = urlMatch[1];
    const title = folderLink.textContent?.trim() || 'Untitled Folder';

    return {
      id,
      title,
      stashUrl: folderLink.href,
      type: 'folder',
      selected: checkbox.checked,
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

  private extractPageInfo(): PageInfo {
    const url = window.location.href;
    const pageType = detectPageType(url);

    // Extract pagination: "1 - 50 of 527"
    const bodyText = document.body.textContent ?? '';
    const paginationMatch = bodyText.match(PATTERNS.paginationTotal);

    let currentPage = 1;
    let totalPages = 1;
    let totalItems = 0;
    const itemsPerPage = 50;

    if (paginationMatch) {
      const start = parseInt(paginationMatch[1], 10);
      const end = parseInt(paginationMatch[2], 10);
      totalItems = parseInt(paginationMatch[3], 10);
      currentPage = Math.ceil(start / itemsPerPage);
      totalPages = Math.ceil(totalItems / itemsPerPage);
    } else {
      // No pagination means single page
      const checkboxes = document.querySelectorAll(ITEM_SELECTORS.checkbox);
      totalItems = checkboxes.length;
    }

    // Detect view mode
    const viewMode = this.detectViewMode();

    // Detect folder context
    let currentFolderId: string | undefined;
    let currentFolderName: string | undefined;
    const folderMatch = url.match(/\/stash\/(2[a-z0-9]+)/i);
    if (folderMatch) {
      currentFolderId = folderMatch[1];
      // Try to get folder name from breadcrumb or heading
      const heading = document.querySelector('h1, h2');
      currentFolderName = heading?.textContent?.trim();
    }

    return {
      pageType,
      currentPage,
      totalPages,
      totalItems,
      itemsPerPage,
      viewMode,
      url,
      currentFolderId,
      currentFolderName,
    };
  }

  private detectViewMode(): 'list' | 'grid' {
    // List mode uses <li> containers, grid mode uses <div> containers
    const listItems = document.querySelectorAll(ITEM_SELECTORS.listItem);
    return listItems.length > 0 ? 'list' : 'grid';
  }
}
