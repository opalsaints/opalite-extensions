/**
 * AppShell — assembles the full UI and wires automation.
 *
 * Used by the content-script entrypoint. Creates all UI components,
 * mounts them into the Shadow DOM renderer, and wires the Orchestrator.
 *
 * Layout: header → itemCounter → progressOverlay → navigator → logsDrawer
 */

import type { IRenderTarget } from './renderers/renderer.interface';
import type { Container } from '../platform/container';
import type { IIntegrationModule } from '../integration/module.interface';

// UI Components
import { Navigator, type PageDefinition } from './components/navigator';
import { DashboardPage } from './components/dashboard-page';
import { ItemCounter } from './components/item-counter';
import { ProgressOverlay } from './components/progress-overlay';
import { LogsDrawer } from './components/logs-drawer';
import { ScheduleTab } from './components/schedule-tab';
import { TierTab } from './components/tier-tab';
import { EditTab } from './components/edit-tab';

// Automation
import { Orchestrator } from '../automation/orchestrator';
import { ScheduleStrategy } from '../automation/strategies/schedule.strategy';
import { TierStrategy } from '../automation/strategies/tier.strategy';
import { EditStrategy } from '../automation/strategies/edit.strategy';
import { actions } from '../core/state/actions';
import type { OperationRecord } from '../core/state/store.types';
import { STORAGE_KEYS } from '../shared/constants';

// Styles (inline imports — Vite returns CSS as string)
import resetCss from './styles/reset.css?inline';
import themeCss from './styles/theme.css?inline';
import componentsCss from './styles/components.css?inline';

export class AppShell {
  private renderer: IRenderTarget;
  private container: Container;

  private navigator: Navigator | null = null;
  private itemCounter: ItemCounter | null = null;
  private progressOverlay: ProgressOverlay | null = null;
  private logsDrawer: LogsDrawer | null = null;
  private orchestrator: Orchestrator | null = null;
  private headerEl: HTMLElement | null = null;
  private navWrapper: HTMLElement | null = null;

  private unsubscribers: Array<() => void> = [];
  private modules: IIntegrationModule[] = [];
  private initialized = false;

  constructor(renderer: IRenderTarget, container: Container) {
    this.renderer = renderer;
    this.container = container;
  }

  /**
   * Initialize the full UI and automation engine.
   */
  init(): void {
    if (this.initialized) return;

    const { eventBus, store, logger } = this.container;

    // 1. Mount the renderer (creates the root element)
    this.renderer.mount();

    // 2. Inject styles
    const allCss = [resetCss, themeCss, componentsCss].join('\n');
    this.renderer.attachStyles(allCss);

    // 2b. Subscribe to effective theme and apply to renderer
    this.unsubscribers.push(
      store.subscribe(
        (state) => state.themeOverride ?? state.themeMode,
        (effectiveTheme) => {
          this.renderer.setTheme(effectiveTheme);
        },
      ),
    );

    const root = this.renderer.getRoot();

    // Make root a flex column so logs drawer sticks to bottom
    root.style.display = 'flex';
    root.style.flexDirection = 'column';

    // 3. Create header
    this.headerEl = this.createHeader();
    root.appendChild(this.headerEl);

    // 4. Create item counter
    this.itemCounter = new ItemCounter();
    this.itemCounter.setStore(store);
    this.itemCounter.mount(root);

    // 5. Create progress overlay
    this.progressOverlay = new ProgressOverlay();
    this.progressOverlay.setEventBus(eventBus);
    this.progressOverlay.setStore(store);
    this.progressOverlay.mount(root);

    // 6. Create navigator with hub-and-spoke pages
    const dashboardPage = new DashboardPage();
    dashboardPage.setEventBus(eventBus);

    const scheduleTab = new ScheduleTab();
    scheduleTab.setEventBus(eventBus);

    const tierTab = new TierTab();
    tierTab.setEventBus(eventBus);
    tierTab.setMessaging(this.container.messaging);

    const editTab = new EditTab();
    editTab.setEventBus(eventBus);

    const pages: PageDefinition[] = [
      { id: 'dashboard', label: 'Dashboard', component: dashboardPage },
      { id: 'schedule', label: 'Schedule', component: scheduleTab },
      { id: 'tier', label: 'Tier', component: tierTab },
      { id: 'edit', label: 'Bulk Edit', component: editTab },
    ];

    this.navigator = new Navigator();
    this.navigator.setPages(pages);
    this.navigator.setStore(store);

    // Navigator needs flex: 1 to fill space between header and logs drawer
    this.navWrapper = document.createElement('div');
    this.navWrapper.style.cssText = 'flex: 1; overflow-y: auto; min-height: 0;';
    this.navigator.mount(this.navWrapper);
    root.appendChild(this.navWrapper);

    // 7. Create logs drawer at bottom
    this.logsDrawer = new LogsDrawer();
    this.logsDrawer.setEventBus(eventBus);
    this.logsDrawer.setStorage(this.container.storage);
    this.logsDrawer.setStore(store);
    this.logsDrawer.mount(root);

    // 8. Wire Orchestrator and commands
    this.orchestrator = new Orchestrator(store, eventBus, logger);

    const scheduleStrategy = new ScheduleStrategy();
    scheduleStrategy.setMessaging(this.container.messaging);
    this.orchestrator.register(scheduleStrategy);

    const tierStrategy = new TierStrategy();
    tierStrategy.setMessaging(this.container.messaging);
    this.orchestrator.register(tierStrategy);

    const editStrategy = new EditStrategy();
    editStrategy.setMessaging(this.container.messaging);
    this.orchestrator.register(editStrategy);
    this.wireCommands();

    this.initialized = true;
    logger.info('AppShell initialized', 'AppShell');
  }

  /**
   * Register an integration module.
   */
  async registerModule(module: IIntegrationModule): Promise<boolean> {
    const { logger } = this.container;

    try {
      const ok = await module.init(this.container);
      if (ok) {
        this.modules.push(module);
        logger.info(`Module registered: ${module.name}`, 'AppShell');
        return true;
      }
      logger.warning(`Module failed to init: ${module.name}`, 'AppShell');
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Module error: ${module.name}: ${msg}`, 'AppShell');
      return false;
    }
  }

  /**
   * Destroy the UI and clean up all resources.
   */
  destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    for (const mod of this.modules) {
      try {
        mod.destroy();
      } catch {
        // Ignore module destroy errors
      }
    }
    this.modules = [];

    this.navigator?.unmount();
    this.itemCounter?.unmount();
    this.progressOverlay?.unmount();
    this.logsDrawer?.unmount();
    this.headerEl?.remove();
    this.navWrapper?.remove();

    this.renderer.unmount();

    this.navigator = null;
    this.itemCounter = null;
    this.progressOverlay = null;
    this.logsDrawer = null;
    this.headerEl = null;
    this.navWrapper = null;
    this.orchestrator = null;
    this.initialized = false;

    this.container.logger.info('AppShell destroyed', 'AppShell');
  }

  getOrchestrator(): Orchestrator | null {
    return this.orchestrator;
  }

  // ── Private ──

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'dsh-header';

    const title = document.createElement('h2');
    title.textContent = 'DA Stash Helper';

    // Button container (right side of header)
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 4px; align-items: center;';

    // Theme toggle button
    const themeBtn = document.createElement('button');
    themeBtn.className = 'dsh-btn dsh-btn-secondary';
    themeBtn.title = 'Toggle theme';
    themeBtn.style.cssText = 'width: 24px; height: 24px; padding: 0; font-size: 14px; line-height: 24px; border-radius: 50%; flex-shrink: 0;';
    themeBtn.textContent = '\u263E'; // Moon by default

    themeBtn.addEventListener('click', () => {
      const state = this.container.store.getState();
      const effectiveTheme = state.themeOverride ?? state.themeMode;
      const newTheme = effectiveTheme === 'dark' ? 'light' : 'dark';
      this.container.store.dispatch(actions.setThemeOverride(newTheme));
      this.persistThemeOverride(newTheme);
    });

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'dsh-btn dsh-btn-secondary';
    refreshBtn.textContent = '\u21BB';
    refreshBtn.title = 'Refresh';
    refreshBtn.style.cssText = 'width: 24px; height: 24px; padding: 0; font-size: 14px; line-height: 24px; border-radius: 50%; flex-shrink: 0;';
    refreshBtn.addEventListener('click', () => {
      this.container.eventBus.emit('command:refresh', undefined);
    });
    this.unsubscribers.push(() => {
      refreshBtn.replaceWith(refreshBtn.cloneNode(true));
      themeBtn.replaceWith(themeBtn.cloneNode(true));
    });

    // Subscribe to effective theme changes to update button icon
    this.unsubscribers.push(
      this.container.store.subscribe(
        (state) => state.themeOverride ?? state.themeMode,
        (effectiveTheme) => {
          themeBtn.textContent = effectiveTheme === 'dark' ? '\u2600' : '\u263E'; // ☀ Sun in dark mode (click to go light), ☾ Moon in light mode
          themeBtn.title = `Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`;
        },
      ),
    );

    btnGroup.appendChild(themeBtn);
    btnGroup.appendChild(refreshBtn);

    header.appendChild(title);
    header.appendChild(btnGroup);

    return header;
  }

  /**
   * Wire EventBus commands to the Orchestrator.
   */
  private wireCommands(): void {
    const { eventBus, logger, store } = this.container;

    this.unsubscribers.push(
      eventBus.on('command:start-schedule', (config) => {
        logger.info('Schedule command received', 'AppShell');
        this.orchestrator?.run('schedule', config);
      }),
    );

    this.unsubscribers.push(
      eventBus.on('command:start-tier', (config) => {
        logger.info('Tier command received', 'AppShell');
        this.orchestrator?.run('tier', config);
      }),
    );

    this.unsubscribers.push(
      eventBus.on('command:start-edit', (config) => {
        logger.info('Edit command received', 'AppShell');
        this.orchestrator?.run('edit', config);
      }),
    );

    // Record completed automations in operation history
    this.unsubscribers.push(
      eventBus.on('automation:completed', (result) => {
        const record: OperationRecord = {
          id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          type: result.strategyId as 'schedule' | 'tier' | 'edit',
          processed: result.processed,
          failed: result.failed,
          durationMs: result.durationMs,
          success: result.success,
        };
        store.dispatch(actions.addOperation(record));

        // Persist to storage
        this.persistOperationHistory();
      }),
    );

    // Bridge pause/resume/cancel to service worker for page-walk operations
    this.unsubscribers.push(
      eventBus.on('command:pause', () => {
        this.container.messaging.send({ type: 'PAUSE_BULK' }).catch(() => {});
      }),
    );
    this.unsubscribers.push(
      eventBus.on('command:resume', () => {
        this.container.messaging.send({ type: 'RESUME_BULK' }).catch(() => {});
      }),
    );
    this.unsubscribers.push(
      eventBus.on('command:cancel', () => {
        this.container.messaging.send({ type: 'CANCEL_BULK' }).catch(() => {});
      }),
    );

    // Scan inventory command (from dashboard "Scan Now" button)
    this.unsubscribers.push(
      eventBus.on('command:scan-all-pages', () => {
        this.container.messaging.send({
          type: 'SCAN_ALL_PAGES',
          stashUrl: window.location.href,
          forceRefresh: true,
        }).then((result: any) => {
          if (result?.success && result.items) {
            store.dispatch(actions.setInventoryCache({
              count: result.items.length,
              lastScan: Date.now(),
              folderTree: result.folderTree,
              totalWithFolders: result.totalWithFolders,
            }));
          }
        }).catch(() => {});
      }),
    );

    // Load persisted data on boot
    this.loadOperationHistory();
    this.loadThemeOverride();
    this.loadInventoryCache();
  }

  private async loadOperationHistory(): Promise<void> {
    try {
      const stored = await this.container.storage.get<OperationRecord[]>(STORAGE_KEYS.OPERATION_HISTORY);
      if (stored && stored.length > 0) {
        this.container.store.dispatch(actions.setOperationHistory(stored));
      }
    } catch {
      // Storage unavailable — skip
    }
  }

  private async persistOperationHistory(): Promise<void> {
    try {
      const history = this.container.store.getState().operationHistory;
      await this.container.storage.set(STORAGE_KEYS.OPERATION_HISTORY, history.slice(0, 50));
    } catch {
      // Storage unavailable — skip
    }
  }

  private async loadThemeOverride(): Promise<void> {
    try {
      const stored = await this.container.storage.get<'dark' | 'light'>(STORAGE_KEYS.THEME_OVERRIDE);
      if (stored) {
        this.container.store.dispatch(actions.setThemeOverride(stored));
      }
    } catch {
      // Storage unavailable — skip
    }
  }

  private async loadInventoryCache(): Promise<void> {
    try {
      const stored = await this.container.storage.get(STORAGE_KEYS.FULL_INVENTORY);
      if (stored && typeof stored === 'object' && 'count' in (stored as any)) {
        const cache = stored as { count: number; lastScan: number; folderTree?: any[]; totalWithFolders?: number };
        this.container.store.dispatch(actions.setInventoryCache({
          count: cache.count,
          lastScan: cache.lastScan,
          folderTree: cache.folderTree,
          totalWithFolders: cache.totalWithFolders,
        }));
      }
    } catch {
      // Storage unavailable — skip
    }
  }

  private async persistThemeOverride(theme: 'dark' | 'light'): Promise<void> {
    try {
      await this.container.storage.set(STORAGE_KEYS.THEME_OVERRIDE, theme);
    } catch {
      // Storage unavailable — skip
    }
  }
}
