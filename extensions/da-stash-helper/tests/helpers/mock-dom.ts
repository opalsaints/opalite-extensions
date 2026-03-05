/**
 * Mock DOM helpers for simulating DeviantArt stash pages.
 * Creates realistic DOM structures for mapper and automation tests.
 */

export interface MockStashItemOptions {
  id: string;
  title: string;
  type?: 'file' | 'folder';
  checked?: boolean;
  thumbnailUrl?: string;
  tags?: string[];
  labels?: string[];
}

/**
 * Create a mock stash item <li> element.
 */
export function createMockStashItem(options: MockStashItemOptions): HTMLLIElement {
  const { id, title, type = 'file', checked = false, thumbnailUrl, tags = [], labels = [] } = options;

  const li = document.createElement('li');

  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.setAttribute('aria-label', 'Select');
  checkbox.checked = checked;
  li.appendChild(checkbox);

  // Link
  const link = document.createElement('a');
  const prefix = type === 'file' ? '0' : '2';
  link.href = `https://www.deviantart.com/stash/${prefix}${id}`;
  link.textContent = title;
  li.appendChild(link);

  // Thumbnail
  if (thumbnailUrl || type === 'file') {
    const img = document.createElement('img');
    img.src = thumbnailUrl ?? `https://example.com/thumb/${id}.jpg`;
    img.alt = title;
    li.appendChild(img);
  }

  // Tags
  for (const tag of tags) {
    const tagEl = document.createElement('span');
    tagEl.setAttribute('data-tagname', tag);
    tagEl.textContent = tag;
    li.appendChild(tagEl);
  }

  // Labels
  for (const label of labels) {
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    li.appendChild(labelEl);
  }

  return li;
}

/**
 * Clear the document body for test setup.
 */
function clearBody(): void {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
}

/**
 * Create a mock stash page with items.
 */
export function createMockStashPage(items: MockStashItemOptions[], pagination?: { start: number; end: number; total: number }): void {
  clearBody();

  const ul = document.createElement('ul');
  for (const item of items) {
    ul.appendChild(createMockStashItem(item));
  }
  document.body.appendChild(ul);

  // Pagination text
  if (pagination) {
    const paginationDiv = document.createElement('div');
    paginationDiv.textContent = `${pagination.start} - ${pagination.end} of ${pagination.total}`;
    document.body.appendChild(paginationDiv);

    // Next/Prev buttons
    if (pagination.start > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.setAttribute('aria-label', 'Previous page');
      document.body.appendChild(prevBtn);

      const firstBtn = document.createElement('button');
      firstBtn.setAttribute('aria-label', 'First page');
      document.body.appendChild(firstBtn);
    }

    if (pagination.end < pagination.total) {
      const nextBtn = document.createElement('button');
      nextBtn.setAttribute('aria-label', 'Next page');
      document.body.appendChild(nextBtn);

      const lastBtn = document.createElement('button');
      lastBtn.setAttribute('aria-label', 'Last page');
      document.body.appendChild(lastBtn);
    }
  }
}

/**
 * Create a mock toolbar with Edit button and menu.
 */
export function createMockToolbar(): void {
  const toolbar = document.createElement('div');

  const editButton = document.createElement('button');
  editButton.textContent = 'Edit';
  toolbar.appendChild(editButton);

  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save Changes';
  toolbar.appendChild(saveButton);

  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  toolbar.appendChild(cancelButton);

  document.body.appendChild(toolbar);
}

/**
 * Create a mock edit menu (React portal on body).
 */
export function createMockEditMenu(): HTMLElement {
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.style.width = '200px';
  menu.style.height = '300px';

  const items = ['Title', 'Tags', 'Description', 'Gallery', 'Subscription tier', 'Display options', 'License', 'Commenting'];

  for (const itemText of items) {
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    item.textContent = itemText;
    menu.appendChild(item);
  }

  document.body.appendChild(menu);
  return menu;
}

/**
 * Create a mock dialog (React portal on body).
 */
export function createMockDialog(title: string): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');

  const heading = document.createElement('h2');
  heading.textContent = title;
  dialog.appendChild(heading);

  document.body.appendChild(dialog);
  return dialog;
}

/**
 * Create a mock confirmation dialog with Update All button.
 */
export function createMockConfirmationDialog(): HTMLElement {
  const dialog = createMockDialog('Confirm Changes');

  const btn = document.createElement('button');
  btn.textContent = 'Update All';
  dialog.appendChild(btn);

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  dialog.appendChild(cancelBtn);

  return dialog;
}
