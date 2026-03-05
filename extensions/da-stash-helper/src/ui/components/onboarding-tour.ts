/**
 * OnboardingTour — first-run walkthrough highlighting dashboard features.
 *
 * On first launch, renders sequential tooltip steps that point to
 * key UI elements inside the Shadow DOM sidebar. Each step has a
 * title, description text, and Next/Skip controls.
 *
 * Once completed or skipped, a flag is persisted to storage so the
 * tour never appears again.
 */

import type { IStorage } from '../../platform/adapters/storage.interface';
import { STORAGE_KEYS } from '../../shared/constants';

interface TourStep {
  title: string;
  text: string;
  /** CSS selector for the target element (within the shadow root). */
  target: string;
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to DA Stash Helper!',
    text: 'This sidebar helps you schedule, tier, and edit your stash items in bulk. Let\u2019s take a quick look around.',
    target: '.dsh-header',
  },
  {
    title: 'Quick Stats',
    text: 'See how many items are loaded and how many you\u2019ve selected at a glance.',
    target: '.dsh-item-counter',
  },
  {
    title: 'Feature Cards',
    text: 'Click a card to jump into Schedule, Tier, or Bulk Edit. Each feature works with your selected items.',
    target: '.dsh-feature-card',
  },
  {
    title: 'Logs Drawer',
    text: 'Click the drawer at the bottom to see detailed operation logs. Error counts show up as a badge.',
    target: '.dsh-logs-drawer-toggle',
  },
  {
    title: 'Keyboard Shortcuts',
    text: 'Ctrl+Shift+S toggles the sidebar. Escape returns to the dashboard. Ctrl+A selects all items.',
    target: '.dsh-header h2',
  },
];

export class OnboardingTour {
  private storage: IStorage;
  private root: HTMLElement;
  private currentStep = 0;
  private backdropEl: HTMLElement | null = null;
  private tooltipEl: HTMLElement | null = null;

  constructor(root: HTMLElement, storage: IStorage) {
    this.root = root;
    this.storage = storage;
  }

  /**
   * Start the tour if the user hasn't completed it yet.
   * Returns immediately if onboarding is already done.
   */
  async start(): Promise<void> {
    try {
      const complete = await this.storage.get<boolean>(STORAGE_KEYS.ONBOARDING_COMPLETE);
      if (complete) return;
    } catch {
      // Storage unavailable — don't block
      return;
    }

    // Small delay to let the dashboard render first
    await new Promise((r) => setTimeout(r, 600));

    this.showStep(0);
  }

  /**
   * Destroy all tour UI elements.
   */
  destroy(): void {
    this.backdropEl?.remove();
    this.tooltipEl?.remove();
    this.backdropEl = null;
    this.tooltipEl = null;
  }

  // ── Private ──

  private showStep(index: number): void {
    this.currentStep = index;

    // Clean up previous
    this.destroy();

    if (index >= STEPS.length) {
      this.completeTour();
      return;
    }

    const step = STEPS[index];

    // Create backdrop
    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'dsh-tour-backdrop';
    this.root.appendChild(this.backdropEl);

    // Find target element
    const target = this.root.querySelector(step.target) as HTMLElement | null;

    // Create tooltip
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'dsh-tour-tooltip';

    // Position tooltip relative to target
    if (target) {
      const rootRect = this.root.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      // Highlight target by raising its z-index temporarily
      const originalZIndex = target.style.zIndex;
      const originalPosition = target.style.position;
      const originalBg = target.style.background;
      target.style.zIndex = '1001';
      target.style.position = 'relative';
      target.style.background = 'var(--dsh-bg-secondary)';

      // Position tooltip below the target
      const topOffset = targetRect.bottom - rootRect.top + 8;
      const leftOffset = Math.max(8, targetRect.left - rootRect.left);
      this.tooltipEl.style.top = `${topOffset}px`;
      this.tooltipEl.style.left = `${leftOffset}px`;

      // Store cleanup to restore target styles
      const cleanup = () => {
        target.style.zIndex = originalZIndex;
        target.style.position = originalPosition;
        target.style.background = originalBg;
      };
      (this.tooltipEl as any).__cleanup = cleanup;
    } else {
      // Center tooltip if target not found
      this.tooltipEl.style.top = '50%';
      this.tooltipEl.style.left = '50%';
      this.tooltipEl.style.transform = 'translate(-50%, -50%)';
    }

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'dsh-tour-title';
    titleEl.textContent = step.title;

    // Text
    const textEl = document.createElement('div');
    textEl.className = 'dsh-tour-text';
    textEl.textContent = step.text;

    // Controls
    const controls = document.createElement('div');
    controls.className = 'dsh-tour-controls';

    const progress = document.createElement('span');
    progress.className = 'dsh-tour-progress';
    progress.textContent = `${index + 1} / ${STEPS.length}`;

    const actionsEl = document.createElement('div');
    actionsEl.className = 'dsh-tour-actions';

    const skipBtn = document.createElement('button');
    skipBtn.className = 'dsh-btn dsh-btn-secondary';
    skipBtn.textContent = 'Skip';
    skipBtn.style.cssText = 'font-size: 11px; padding: 3px 8px;';
    skipBtn.addEventListener('click', () => {
      this.cleanupTarget();
      this.completeTour();
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'dsh-btn dsh-btn-primary';
    nextBtn.textContent = index === STEPS.length - 1 ? 'Got it!' : 'Next';
    nextBtn.style.cssText = 'font-size: 11px; padding: 3px 10px;';
    nextBtn.addEventListener('click', () => {
      this.cleanupTarget();
      this.showStep(index + 1);
    });

    actionsEl.appendChild(skipBtn);
    actionsEl.appendChild(nextBtn);

    controls.appendChild(progress);
    controls.appendChild(actionsEl);

    this.tooltipEl.appendChild(titleEl);
    this.tooltipEl.appendChild(textEl);
    this.tooltipEl.appendChild(controls);

    this.root.appendChild(this.tooltipEl);
  }

  private cleanupTarget(): void {
    if (this.tooltipEl && (this.tooltipEl as any).__cleanup) {
      (this.tooltipEl as any).__cleanup();
    }
  }

  private completeTour(): void {
    this.destroy();
    this.storage.set(STORAGE_KEYS.ONBOARDING_COMPLETE, true).catch(() => {});
  }
}
