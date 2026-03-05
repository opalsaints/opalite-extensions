import {
  ITEM_SELECTORS,
  TOOLBAR_SELECTORS,
  PAGINATION_SELECTORS,
  PATTERNS,
  URL_PATTERNS,
  TOOLBAR_BUTTONS,
  EDIT_MENU_ITEMS,
  LABEL_OPTIONS,
  CONFIRMATION_BUTTONS,
  CONFIG_PAGE_SELECTORS,
  SCHEDULE_SELECTORS,
} from '../../../src/core/dom/selectors';

describe('ITEM_SELECTORS', () => {
  it('checkbox is a valid non-empty CSS selector string', () => {
    expect(typeof ITEM_SELECTORS.checkbox).toBe('string');
    expect(ITEM_SELECTORS.checkbox.length).toBeGreaterThan(0);
  });

  it('itemLink selector targets stash item links', () => {
    expect(ITEM_SELECTORS.itemLink).toContain('/stash/0');
  });

  it('folderLink selector targets stash folder links', () => {
    expect(ITEM_SELECTORS.folderLink).toContain('/stash/2');
  });

  it('all selectors are non-empty strings', () => {
    for (const [key, value] of Object.entries(ITEM_SELECTORS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('TOOLBAR_SELECTORS', () => {
  it('all selectors are non-empty strings', () => {
    for (const [key, value] of Object.entries(TOOLBAR_SELECTORS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('menu uses ARIA role', () => {
    expect(TOOLBAR_SELECTORS.menu).toContain('[role="menu"]');
  });

  it('dialog uses ARIA role', () => {
    expect(TOOLBAR_SELECTORS.dialog).toContain('[role="dialog"]');
  });
});

describe('PAGINATION_SELECTORS', () => {
  it('all selectors are non-empty strings', () => {
    for (const [key, value] of Object.entries(PAGINATION_SELECTORS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('uses aria-label for navigation buttons', () => {
    expect(PAGINATION_SELECTORS.nextPage).toContain('aria-label');
    expect(PAGINATION_SELECTORS.previousPage).toContain('aria-label');
  });
});

describe('URL_PATTERNS', () => {
  describe('stash', () => {
    it('matches stash root URL', () => {
      expect(URL_PATTERNS.stash.test('https://www.deviantart.com/stash/')).toBe(true);
    });

    it('matches stash URL without trailing slash', () => {
      expect(URL_PATTERNS.stash.test('https://www.deviantart.com/stash')).toBe(true);
    });

    it('does not match unrelated DA URLs', () => {
      expect(URL_PATTERNS.stash.test('https://www.deviantart.com/gallery')).toBe(false);
    });

    it('does not match non-DA URLs', () => {
      expect(URL_PATTERNS.stash.test('https://example.com/stash/')).toBe(false);
    });
  });

  describe('submitPage', () => {
    it('matches submit page URL', () => {
      expect(URL_PATTERNS.submitPage.test('https://www.deviantart.com/_deviation_submit/abc123')).toBe(true);
    });

    it('does not match non-submit URLs', () => {
      expect(URL_PATTERNS.submitPage.test('https://www.deviantart.com/stash/')).toBe(false);
    });
  });

  describe('stashItem', () => {
    it('matches stash item URLs (start with 0)', () => {
      expect(URL_PATTERNS.stashItem.test('/stash/0abc123')).toBe(true);
    });

    it('does not match folder URLs', () => {
      expect(URL_PATTERNS.stashItem.test('/stash/2abc123')).toBe(false);
    });
  });

  describe('stashFolder', () => {
    it('matches stash folder URLs (start with 2)', () => {
      expect(URL_PATTERNS.stashFolder.test('/stash/2abc123')).toBe(true);
    });

    it('does not match item URLs', () => {
      expect(URL_PATTERNS.stashFolder.test('/stash/0abc123')).toBe(false);
    });
  });

  describe('studio', () => {
    it('matches studio URL', () => {
      expect(URL_PATTERNS.studio.test('https://www.deviantart.com/studio/published')).toBe(true);
    });

    it('does not match stash URL', () => {
      expect(URL_PATTERNS.studio.test('https://www.deviantart.com/stash/')).toBe(false);
    });
  });

  describe('galleryPage', () => {
    it('matches gallery page URL', () => {
      expect(URL_PATTERNS.galleryPage.test('/studio/published/my-gallery')).toBe(true);
    });
  });

  describe('tierPage', () => {
    it('matches tier page URL', () => {
      expect(URL_PATTERNS.tierPage.test('/studio/tier/bronze-tier/deviations')).toBe(true);
    });
  });
});

describe('PATTERNS', () => {
  describe('paginationTotal', () => {
    it('matches "1 - 50 of 527"', () => {
      const match = '1 - 50 of 527'.match(PATTERNS.paginationTotal);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('1');
      expect(match![2]).toBe('50');
      expect(match![3]).toBe('527');
    });

    it('matches "51 - 100 of 200"', () => {
      const match = '51 - 100 of 200'.match(PATTERNS.paginationTotal);
      expect(match).not.toBeNull();
    });

    it('does not match plain text', () => {
      expect(PATTERNS.paginationTotal.test('hello world')).toBe(false);
    });
  });

  describe('selectionCount', () => {
    it('matches "5 Selected"', () => {
      const match = '5 Selected'.match(PATTERNS.selectionCount);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('5');
    });

    it('matches "100 Selected"', () => {
      const match = '100 Selected'.match(PATTERNS.selectionCount);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('100');
    });
  });

  describe('submitButton', () => {
    it('matches "Submit 3 Deviations"', () => {
      const match = 'Submit 3 Deviations'.match(PATTERNS.submitButton);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('3');
    });

    it('matches "Submit 1 Deviation"', () => {
      expect(PATTERNS.submitButton.test('Submit 1 Deviation')).toBe(true);
    });
  });

  describe('deviationCount', () => {
    it('matches "4 deviations"', () => {
      expect(PATTERNS.deviationCount.test('4 deviations')).toBe(true);
    });

    it('matches "1 deviation" (singular)', () => {
      expect(PATTERNS.deviationCount.test('1 deviation')).toBe(true);
    });
  });

  describe('scheduleTime', () => {
    it('matches "9 AM"', () => {
      expect(PATTERNS.scheduleTime.test('9 AM')).toBe(true);
    });

    it('matches "12 PM"', () => {
      expect(PATTERNS.scheduleTime.test('12 PM')).toBe(true);
    });
  });
});

describe('constant objects are fully populated', () => {
  it('TOOLBAR_BUTTONS has non-empty string values', () => {
    for (const value of Object.values(TOOLBAR_BUTTONS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('EDIT_MENU_ITEMS has non-empty string values', () => {
    for (const value of Object.values(EDIT_MENU_ITEMS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('LABEL_OPTIONS has non-empty string values', () => {
    for (const value of Object.values(LABEL_OPTIONS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('SCHEDULE_SELECTORS has non-empty string values', () => {
    for (const value of Object.values(SCHEDULE_SELECTORS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('CONFIG_PAGE_SELECTORS has non-empty string values', () => {
    for (const value of Object.values(CONFIG_PAGE_SELECTORS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
