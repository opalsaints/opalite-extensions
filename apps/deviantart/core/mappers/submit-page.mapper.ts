/**
 * SubmitPageMapper — captures submit/edit page form state.
 *
 * Runs when navigation to /_deviation_submit/ is detected.
 * Extracts the current form values (title, tags, description,
 * galleries, tiers, maturity flags, schedule state) and emits
 * them as a SubmitFormState event for the automation engine.
 */

import type { IMapper, MapperContext } from './mapper.interface';
import type { SubmitFormState } from '../events/event-types';
import { URL_PATTERNS, TOOLBAR_SELECTORS } from '../dom/selectors';
import { waitForElement } from '../dom/wait-for-element';
import { TIMING } from '../../shared/constants';

export class SubmitPageMapper implements IMapper {
  readonly id = 'submit-page';
  readonly type = 'submit-page' as const;

  private context!: MapperContext;

  async init(context: MapperContext): Promise<void> {
    this.context = context;
    context.logger.info('SubmitPageMapper initialized', 'SubmitPageMapper');
  }

  async scan(): Promise<void> {
    const { eventBus, logger } = this.context;

    if (!URL_PATTERNS.submitPage.test(window.location.href)) {
      logger.debug('Not on submit page — skipping', 'SubmitPageMapper');
      return;
    }

    logger.info('Scanning submit page form state', 'SubmitPageMapper');

    // Wait for form to be fully loaded
    try {
      await waitForElement({
        selector: 'input, textarea, [contenteditable="true"]',
        timeout: TIMING.ELEMENT_TIMEOUT,
      });
    } catch {
      logger.warning('Submit page form elements not found', 'SubmitPageMapper');
    }

    const formState: SubmitFormState = {
      deviationId: this.extractDeviationId(),
      title: this.extractTitle(),
      tags: this.extractTags(),
      description: this.extractDescription(),
      galleryIds: this.extractGalleryIds(),
      tierIds: this.extractTierIds(),
      isScheduled: this.detectScheduleState(),
      scheduledDate: this.extractScheduledDate(),
      mature: this.detectLabel('Mature'),
      aiGenerated: this.detectLabel('Created using AI') || this.detectLabel('AI-Generated'),
      noAi: this.detectLabel('NoAI'),
    };

    eventBus.emit('mapper:submit-page-captured', { formState });
    logger.info(
      `Submit page captured: "${formState.title}" (${formState.tags.length} tags, scheduled: ${formState.isScheduled})`,
      'SubmitPageMapper',
    );
  }

  destroy(): void {
    this.context?.logger.debug('SubmitPageMapper destroyed', 'SubmitPageMapper');
  }

  // ── Extraction Methods ──

  private extractDeviationId(): string {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('deviationid') ?? '';
    } catch {
      return '';
    }
  }

  private extractTitle(): string {
    // Title is usually in an input with placeholder or aria-label containing "title"
    const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i] as HTMLInputElement;
      const placeholder = input.placeholder?.toLowerCase() ?? '';
      const ariaLabel = input.getAttribute('aria-label')?.toLowerCase() ?? '';

      if (placeholder.includes('title') || ariaLabel.includes('title')) {
        return input.value;
      }
    }

    // Fallback: first text input on the page
    const firstInput = document.querySelector('input[type="text"]') as HTMLInputElement | null;
    return firstInput?.value ?? '';
  }

  private extractTags(): string[] {
    const tags: string[] = [];

    // Tags in DA are displayed as removable chips/badges
    const tagElements = document.querySelectorAll('[data-tagname]');
    for (let i = 0; i < tagElements.length; i++) {
      const tagName = tagElements[i].getAttribute('data-tagname');
      if (tagName) tags.push(tagName);
    }

    // Also check for tag input with comma-separated values
    if (tags.length === 0) {
      const tagInputs = document.querySelectorAll('input');
      for (let i = 0; i < tagInputs.length; i++) {
        const input = tagInputs[i] as HTMLInputElement;
        const label = input.getAttribute('aria-label')?.toLowerCase() ?? '';
        const placeholder = input.placeholder?.toLowerCase() ?? '';

        if (label.includes('tag') || placeholder.includes('tag')) {
          const value = input.value.trim();
          if (value) {
            tags.push(...value.split(',').map((t) => t.trim()).filter(Boolean));
          }
        }
      }
    }

    return tags;
  }

  private extractDescription(): string {
    // Description is in a contenteditable rich editor
    const editor = document.querySelector(
      TOOLBAR_SELECTORS.richEditor,
    ) as HTMLElement | null;

    if (editor) {
      return editor.textContent?.trim() ?? '';
    }

    // Fallback: textarea
    const textareas = document.querySelectorAll('textarea');
    for (let i = 0; i < textareas.length; i++) {
      const ta = textareas[i] as HTMLTextAreaElement;
      const label = ta.getAttribute('aria-label')?.toLowerCase() ?? '';
      const placeholder = ta.placeholder?.toLowerCase() ?? '';

      if (label.includes('description') || placeholder.includes('description')) {
        return ta.value;
      }
    }

    return '';
  }

  private extractGalleryIds(): string[] {
    const ids: string[] = [];

    // Galleries are shown as selected options in a combobox
    const selectedOptions = document.querySelectorAll('[role="option"][aria-selected="true"]');
    for (let i = 0; i < selectedOptions.length; i++) {
      const option = selectedOptions[i] as HTMLElement;
      const parentLabel = option.closest('[aria-label]')?.getAttribute('aria-label') ?? '';
      if (parentLabel.toLowerCase().includes('gallery') || parentLabel.toLowerCase().includes('folder')) {
        const id = option.getAttribute('data-value') ?? option.textContent?.trim() ?? '';
        if (id) ids.push(id);
      }
    }

    return ids;
  }

  private extractTierIds(): string[] {
    const ids: string[] = [];

    // Look for tier-related selected options
    const selectedOptions = document.querySelectorAll('[role="option"][aria-selected="true"]');
    for (let i = 0; i < selectedOptions.length; i++) {
      const option = selectedOptions[i] as HTMLElement;
      const parentLabel = option.closest('[aria-label]')?.getAttribute('aria-label') ?? '';
      if (parentLabel.toLowerCase().includes('tier') || parentLabel.toLowerCase().includes('subscription')) {
        const id = option.getAttribute('data-value') ?? option.textContent?.trim() ?? '';
        if (id) ids.push(id);
      }
    }

    return ids;
  }

  private detectScheduleState(): boolean {
    const bodyText = document.body.textContent ?? '';
    return bodyText.includes('Scheduled') || bodyText.includes('Schedule publication');
  }

  private extractScheduledDate(): string | undefined {
    const dateInputs = document.querySelectorAll('input[type="date"], input[type="datetime-local"]');
    for (let i = 0; i < dateInputs.length; i++) {
      const input = dateInputs[i] as HTMLInputElement;
      if (input.value) return input.value;
    }
    return undefined;
  }

  private detectLabel(labelText: string): boolean {
    // Look for toggle/checkbox elements near the label text
    const labelElements = document.querySelectorAll('[role="switch"], [role="checkbox"]');
    for (let i = 0; i < labelElements.length; i++) {
      const el = labelElements[i] as HTMLElement;
      const nearbyText = el.parentElement?.textContent ?? '';

      if (nearbyText.includes(labelText)) {
        const isChecked =
          el.getAttribute('aria-checked') === 'true' ||
          (el instanceof HTMLInputElement && el.checked);
        return isChecked;
      }
    }

    return false;
  }
}
