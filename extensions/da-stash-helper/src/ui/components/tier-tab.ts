/**
 * TierTab — subscription tier selection form.
 *
 * Populates a dropdown with the user's tiers from the store.
 * If no tiers are found, auto-discovers them by asking the
 * service worker to open the galleries page in a background tab.
 * Emits command:start-tier when the user clicks Apply.
 */

import { BaseComponent } from './base-component';
import { Dropdown, type DropdownItem } from './dropdown';
import type { IEventBus } from '../../core/events/event-bus';
import type { EventMap } from '../../core/events/event-types';
import type { IMessagingAdapter } from '../../platform/interfaces';
import type { TierConfig, BulkScope } from '../../shared/types';
import { actions } from '../../core/state/actions';
import { STORAGE_KEYS, DEFAULTS } from '../../shared/constants';
import { SCOPE_OPTIONS, buildScopeSelector } from './scope-selector';

export class TierTab extends BaseComponent {
  private eventBus: IEventBus<EventMap> | null = null;
  private messaging: IMessagingAdapter | null = null;
  private tierDropdown: Dropdown;
  private applyButton!: HTMLButtonElement;
  private refreshButton!: HTMLButtonElement;
  private infoText!: HTMLElement;
  private isDiscovering = false;
  private scopeOptionEls: HTMLElement[] = [];
  private currentScope: BulkScope = 'selected';

  constructor() {
    super('div', 'dsh-tier-tab');

    this.tierDropdown = new Dropdown({
      placeholder: 'Select tier(s)',
      multiple: true,
      label: 'Subscription Tiers',
    });
  }

  setEventBus(eventBus: IEventBus<EventMap>): this {
    this.eventBus = eventBus;
    return this;
  }

  setMessaging(messaging: IMessagingAdapter): this {
    this.messaging = messaging;
    return this;
  }

  protected render(): void {
    // Scope selector (4-option radio list)
    this.renderScopeSelector();

    // Tier dropdown (populated from store)
    if (this.store) {
      this.tierDropdown.setStore(this.store);
    }
    this.tierDropdown.mount(this.el);

    // Refresh tiers button
    this.refreshButton = document.createElement('button');
    this.refreshButton.textContent = 'Refresh Tiers';
    this.refreshButton.className = 'dsh-btn dsh-btn-secondary';
    this.refreshButton.style.cssText = 'width: 100%; margin-top: 4px; font-size: 11px;';
    this.el.appendChild(this.refreshButton);

    // Info text
    this.infoText = document.createElement('div');
    this.infoText.style.cssText = 'font-size: 11px; color: var(--dsh-text-secondary); margin: 8px 0;';
    this.el.appendChild(this.infoText);

    // Apply button
    this.applyButton = document.createElement('button');
    this.applyButton.textContent = 'Apply Tier';
    this.applyButton.className = 'dsh-btn dsh-btn-primary';
    this.applyButton.style.cssText = 'width: 100%; margin-top: 8px;';
    this.el.appendChild(this.applyButton);
  }

  protected onMount(): void {
    // Scope option click handlers
    for (const el of this.scopeOptionEls) {
      this.on(el, 'click', () => {
        const scope = el.dataset.scope as BulkScope;
        if (scope) this.setScope(scope);
      });
    }

    // Populate dropdown with tiers from store
    this.watch(
      (state) => state.tiers,
      (tiers) => {
        const items: DropdownItem[] = tiers.map((t) => ({
          value: t.id,
          label: `${t.name} (${t.deviationCount} deviations)`,
        }));
        this.tierDropdown.setItems(items);

        // Update info text
        if (tiers.length === 0 && !this.isDiscovering) {
          this.infoText.textContent = 'No tiers found. Click "Refresh Tiers" to discover.';
        }
      },
    );

    // Update info text and button state based on selection and scope
    this.watch(
      (state) => state.selectedIds.length,
      () => this.updateButtonState(),
    );

    // Watch totalItems for scope label updates
    this.watch(
      (state) => state.pageInfo.totalItems,
      () => this.updateButtonState(),
    );

    // Refresh tiers button
    this.on(this.refreshButton, 'click', () => this.discoverTiers());

    // Apply button
    this.on(this.applyButton, 'click', () => this.handleApply());

    // Auto-discover tiers if none are loaded or cache is stale
    const tiers = this.store?.getState().tiers ?? [];
    if (tiers.length === 0) {
      this.discoverTiers();
    } else {
      this.refreshIfStale();
    }
  }

  private async refreshIfStale(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.USER_CONFIG);
      const config = stored[STORAGE_KEYS.USER_CONFIG];
      if (!config?.timestamp) return;

      const age = Date.now() - config.timestamp;
      if (age > DEFAULTS.CONFIG_CACHE_TTL_MS) {
        this.infoText.textContent = 'Cache expired — refreshing...';
        this.discoverTiers();
      }
    } catch {
      // Storage access may fail — ignore
    }
  }

  private async discoverTiers(): Promise<void> {
    if (!this.messaging || this.isDiscovering) return;

    this.isDiscovering = true;
    this.refreshButton.disabled = true;
    this.refreshButton.textContent = 'Discovering...';
    this.infoText.textContent = 'Opening galleries page in background...';

    try {
      const result = await this.messaging.send({ type: 'DISCOVER_CONFIG' }) as {
        success: boolean;
        galleries: Array<{ id: string; name: string; deviationCount: number; isPremium: boolean; isDefault: boolean; url: string }>;
        tiers: Array<{ id: string; name: string; deviationCount: number; url: string }>;
        error?: string;
      };

      if (result?.success) {
        // Update store with discovered galleries and tiers
        if (result.galleries.length > 0) {
          this.store?.dispatch(actions.setGalleries(result.galleries));
        }
        if (result.tiers.length > 0) {
          this.store?.dispatch(actions.setTiers(result.tiers));
        }
        const parts: string[] = [];
        if (result.galleries.length > 0) parts.push(`${result.galleries.length} gallery(ies)`);
        if (result.tiers.length > 0) parts.push(`${result.tiers.length} tier(s)`);
        this.infoText.textContent = parts.length > 0
          ? `Found ${parts.join(', ')}`
          : 'No galleries or tiers found on your account.';
      } else if (result?.error) {
        this.infoText.textContent = `Discovery failed: ${result.error}`;
      } else {
        this.infoText.textContent = 'No galleries or tiers found on your account.';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.infoText.textContent = `Error: ${msg}`;
    } finally {
      this.isDiscovering = false;
      this.refreshButton.disabled = false;
      this.refreshButton.textContent = 'Refresh Tiers';
    }
  }

  // ── Scope Selector ──

  private renderScopeSelector(): void {
    const { group, optionEls } = buildScopeSelector(this.currentScope);
    this.scopeOptionEls = optionEls;
    this.el.appendChild(group);
  }

  private setScope(scope: BulkScope): void {
    this.currentScope = scope;
    for (const el of this.scopeOptionEls) {
      el.classList.toggle('active', el.dataset.scope === scope);
    }
    this.updateButtonState();
  }

  private updateButtonState(): void {
    const state = this.store?.getState();
    const tiers = state?.tiers ?? [];
    if (tiers.length === 0) return;

    if (this.currentScope === 'selected') {
      const count = state?.selectedIds.length ?? 0;
      this.infoText.textContent = count > 0 ? `${count} item(s) selected` : 'Select items first';
      this.applyButton.disabled = count === 0;
    } else {
      const totalItems = state?.pageInfo.totalItems ?? 0;
      const scopeLabel = SCOPE_OPTIONS.find((o) => o.value === this.currentScope)?.label ?? this.currentScope;
      this.infoText.textContent = `${scopeLabel}: ${totalItems} item(s)`;
      this.applyButton.disabled = totalItems === 0;
    }
  }

  private handleApply(): void {
    if (!this.eventBus) return;

    const tierIds = this.tierDropdown.getSelectedValues();
    if (tierIds.length === 0) return;

    const config: TierConfig = {
      tierIds,
      mode: 'replace',
      scope: this.currentScope,
    };

    this.eventBus.emit('command:start-tier', config);
  }
}
