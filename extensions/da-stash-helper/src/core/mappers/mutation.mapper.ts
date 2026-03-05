/**
 * MutationMapper — watches DOM changes in real-time via MutationObserver.
 *
 * Always running on stash pages. Detects:
 *   - Selection changes (checkbox state)
 *   - Item additions/removals (page content changes)
 *   - Menu/dialog appearance (React portals)
 *   - View mode toggles
 */

import type { IMapper, MapperContext } from './mapper.interface';
import type { StashItem } from '../state/store.types';
import { ITEM_SELECTORS, TOOLBAR_SELECTORS } from '../dom/selectors';

export class MutationMapper implements IMapper {
  readonly id = 'mutation';
  readonly type = 'mutation' as const;

  private context!: MapperContext;
  private bodyObserver: MutationObserver | null = null;
  private lastCheckboxStates = new Map<string, boolean>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private changeHandler: ((e: Event) => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;

  async init(context: MapperContext): Promise<void> {
    // Guard against double-init — disconnect any existing observers first
    this.destroy();

    this.context = context;
    context.logger.info('MutationMapper initialized', 'MutationMapper');

    this.observeBody();
    this.observeCheckboxes();
  }

  async scan(): Promise<void> {
    // MutationMapper doesn't do full scans — it watches continuously.
    // Calling scan() recaptures the baseline checkbox state.
    this.captureCheckboxBaseline();
    this.checkSelectionChanges();
  }

  destroy(): void {
    if (this.bodyObserver) {
      this.bodyObserver.disconnect();
      this.bodyObserver = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.changeHandler) {
      document.removeEventListener('change', this.changeHandler, true);
      this.changeHandler = null;
    }
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
      this.clickHandler = null;
    }
    this.lastCheckboxStates.clear();
    this.context?.logger.debug('MutationMapper destroyed', 'MutationMapper');
  }

  // ── Body Observer ──
  // Watches document.body for React portals (menus, dialogs) and content changes.

  private observeBody(): void {
    this.bodyObserver = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        if (mutation.type !== 'childList') continue;

        // Check added nodes for menus/dialogs
        for (let j = 0; j < mutation.addedNodes.length; j++) {
          const node = mutation.addedNodes[j];
          if (!(node instanceof HTMLElement)) continue;

          this.checkForMenu(node);
          this.checkForDialog(node);
          this.checkForItemChanges(node);
        }

        // Check removed nodes
        for (let j = 0; j < mutation.removedNodes.length; j++) {
          const node = mutation.removedNodes[j];
          if (!(node instanceof HTMLElement)) continue;

          this.checkForMenuDismissal(node);
          this.checkForDialogDismissal(node);
        }
      }
    });

    this.bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ── Checkbox Detection ──
  // React sets checkbox.checked as a JS property, NOT an HTML attribute,
  // so MutationObserver never fires. We use two strategies:
  //   1. Event delegation — capture 'change' and 'click' events on checkboxes
  //   2. Lightweight polling (1s) — catches anything events miss (e.g. "Select All")

  private observeCheckboxes(): void {
    this.captureCheckboxBaseline();

    // Strategy 1: Event delegation (captures checkbox clicks immediately)
    this.changeHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement && target.type === 'checkbox') {
        // Brief delay to let React finish updating state
        setTimeout(() => this.checkSelectionChanges(), 50);
      }
    };
    document.addEventListener('change', this.changeHandler, true);

    // Also listen for clicks on labels/containers that toggle checkboxes
    this.clickHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      // Check if click is on or near a checkbox area (label, li, Select All)
      const checkbox = target.closest('label')?.querySelector('input[type="checkbox"]')
        ?? target.closest('li')?.querySelector(ITEM_SELECTORS.checkbox);
      if (checkbox) {
        setTimeout(() => this.checkSelectionChanges(), 100);
      }
    };
    document.addEventListener('click', this.clickHandler, true);

    // Strategy 2: Poll every 1 second as fallback (catches Select All, React state resets, etc.)
    this.pollTimer = setInterval(() => this.checkSelectionChanges(), 1000);
  }

  private captureCheckboxBaseline(): void {
    this.lastCheckboxStates.clear();
    const checkboxes = document.querySelectorAll(ITEM_SELECTORS.checkbox) as NodeListOf<HTMLInputElement>;

    for (let i = 0; i < checkboxes.length; i++) {
      const cb = checkboxes[i];
      const id = this.getCheckboxItemId(cb);
      if (id) {
        this.lastCheckboxStates.set(id, cb.checked);
      }
    }
  }

  private checkSelectionChanges(): void {
    const checkboxes = document.querySelectorAll(ITEM_SELECTORS.checkbox) as NodeListOf<HTMLInputElement>;
    const currentSelectedIds: string[] = [];
    let changed = false;

    for (let i = 0; i < checkboxes.length; i++) {
      const cb = checkboxes[i];
      const id = this.getCheckboxItemId(cb);
      if (!id) continue;

      if (cb.checked) {
        currentSelectedIds.push(id);
      }

      const lastState = this.lastCheckboxStates.get(id);
      if (lastState !== cb.checked) {
        changed = true;
        this.lastCheckboxStates.set(id, cb.checked);
      }
    }

    if (changed) {
      this.context.eventBus.emit('mapper:selection-changed', { selectedIds: currentSelectedIds });
      this.context.logger.debug(
        `Selection changed: ${currentSelectedIds.length} selected`,
        'MutationMapper',
      );
    }
  }

  private getCheckboxItemId(checkbox: HTMLInputElement): string | null {
    const container = checkbox.closest('li') ?? checkbox.parentElement;
    if (!container) return null;

    const link = container.querySelector(ITEM_SELECTORS.itemLink) as HTMLAnchorElement | null
      ?? container.querySelector(ITEM_SELECTORS.folderLink) as HTMLAnchorElement | null;

    if (!link) return null;

    const match = link.href.match(/\/stash\/([0-9a-z]+)/i);
    return match?.[1] ?? null;
  }

  // ── Menu Detection ──

  private checkForMenu(node: HTMLElement): void {
    if (node.matches(TOOLBAR_SELECTORS.menu) || node.querySelector(TOOLBAR_SELECTORS.menu)) {
      const menus = document.querySelectorAll(TOOLBAR_SELECTORS.menu);
      // Find the newly added, visible menu (skip tiny header menu)
      for (let i = menus.length - 1; i >= 0; i--) {
        const menu = menus[i] as HTMLElement;
        const rect = menu.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10) {
          this.context.logger.debug('Menu opened', 'MutationMapper');
          break;
        }
      }
    }
  }

  private checkForMenuDismissal(node: HTMLElement): void {
    if (node.matches(TOOLBAR_SELECTORS.menu) || node.querySelector(TOOLBAR_SELECTORS.menu)) {
      this.context.logger.debug('Menu closed', 'MutationMapper');
    }
  }

  // ── Dialog Detection ──

  private checkForDialog(node: HTMLElement): void {
    if (node.matches(TOOLBAR_SELECTORS.dialog) || node.querySelector(TOOLBAR_SELECTORS.dialog)) {
      this.context.logger.debug('Dialog opened', 'MutationMapper');
    }
  }

  private checkForDialogDismissal(node: HTMLElement): void {
    if (node.matches(TOOLBAR_SELECTORS.dialog) || node.querySelector(TOOLBAR_SELECTORS.dialog)) {
      this.context.logger.debug('Dialog closed', 'MutationMapper');
    }
  }

  // ── Item Change Detection ──

  private checkForItemChanges(node: HTMLElement): void {
    // Check if added node contains stash item checkboxes
    const newCheckboxes = node.querySelectorAll(ITEM_SELECTORS.checkbox);
    if (newCheckboxes.length > 0) {
      this.context.logger.debug(
        `${newCheckboxes.length} new items detected in DOM`,
        'MutationMapper',
      );

      // Trigger a page-state rescan to capture the new items
      // Using a debounce to avoid scanning on every single mutation
      this.debouncedRescan();
    }
  }

  // ── Debounced Rescan ──

  private rescanTimer: ReturnType<typeof setTimeout> | null = null;

  private debouncedRescan(): void {
    if (this.rescanTimer) return;
    this.rescanTimer = setTimeout(() => {
      this.rescanTimer = null;
      this.context.logger.debug('Triggering page-state rescan after DOM changes', 'MutationMapper');
      this.captureCheckboxBaseline();
      this.checkSelectionChanges();
      // Emit refresh so PageStateMapper rescans items too
      this.context.eventBus.emit('command:refresh', undefined);
    }, 500);
  }
}
