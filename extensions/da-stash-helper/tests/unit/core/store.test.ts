import { Store } from '../../../src/core/state/store';
import { actions } from '../../../src/core/state/actions';
import { createInitialState } from '../../../src/core/state/store.types';
import type { StashItem, Gallery, Tier, PageInfo } from '../../../src/core/state/store.types';

function makeItem(overrides: Partial<StashItem> & { id: string }): StashItem {
  return {
    title: `Item ${overrides.id}`,
    stashUrl: `/stash/0${overrides.id}`,
    type: 'file',
    selected: false,
    ...overrides,
  };
}

describe('Store', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(createInitialState());
  });

  describe('initial state', () => {
    it('matches createInitialState()', () => {
      expect(store.getState()).toEqual(createInitialState());
    });

    it('has empty items and selectedIds', () => {
      const state = store.getState();
      expect(state.items).toEqual([]);
      expect(state.selectedIds).toEqual([]);
    });
  });

  describe('SET_ITEMS', () => {
    it('replaces items array', () => {
      const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
      store.dispatch(actions.setItems(items));

      expect(store.getState().items).toHaveLength(2);
      expect(store.getState().items[0].id).toBe('a');
      expect(store.getState().items[1].id).toBe('b');
    });
  });

  describe('SET_SELECTION', () => {
    it('updates selectedIds and marks items as selected', () => {
      const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })];
      store.dispatch(actions.setItems(items));
      store.dispatch(actions.setSelection(['a', 'c']));

      const state = store.getState();
      expect(state.selectedIds).toEqual(['a', 'c']);
      expect(state.items[0].selected).toBe(true);
      expect(state.items[1].selected).toBe(false);
      expect(state.items[2].selected).toBe(true);
    });
  });

  describe('TOGGLE_SELECTION', () => {
    it('selects an unselected item', () => {
      store.dispatch(actions.setItems([makeItem({ id: 'x' })]));
      store.dispatch(actions.toggleSelection('x'));

      const state = store.getState();
      expect(state.selectedIds).toContain('x');
      expect(state.items[0].selected).toBe(true);
    });

    it('deselects an already selected item', () => {
      store.dispatch(actions.setItems([makeItem({ id: 'x' })]));
      store.dispatch(actions.toggleSelection('x'));
      store.dispatch(actions.toggleSelection('x'));

      const state = store.getState();
      expect(state.selectedIds).not.toContain('x');
      expect(state.items[0].selected).toBe(false);
    });
  });

  describe('SELECT_ALL / DESELECT_ALL', () => {
    beforeEach(() => {
      store.dispatch(actions.setItems([
        makeItem({ id: 'a' }),
        makeItem({ id: 'b' }),
        makeItem({ id: 'c' }),
      ]));
    });

    it('SELECT_ALL selects every item', () => {
      store.dispatch(actions.selectAll());

      const state = store.getState();
      expect(state.selectedIds).toEqual(['a', 'b', 'c']);
      expect(state.items.every((i) => i.selected)).toBe(true);
    });

    it('DESELECT_ALL clears selection', () => {
      store.dispatch(actions.selectAll());
      store.dispatch(actions.deselectAll());

      const state = store.getState();
      expect(state.selectedIds).toEqual([]);
      expect(state.items.every((i) => !i.selected)).toBe(true);
    });
  });

  describe('SET_PAGE_INFO', () => {
    it('updates pageInfo', () => {
      const pageInfo: PageInfo = {
        pageType: 'stash',
        currentPage: 2,
        totalPages: 5,
        totalItems: 250,
        itemsPerPage: 50,
        viewMode: 'grid',
        url: 'https://deviantart.com/stash',
      };
      store.dispatch(actions.setPageInfo(pageInfo));

      expect(store.getState().pageInfo).toEqual(pageInfo);
    });
  });

  describe('SET_GALLERIES', () => {
    it('updates galleries', () => {
      const galleries: Gallery[] = [
        { id: 'g1', name: 'Gallery 1', deviationCount: 10, isPremium: false, isDefault: true, url: '/studio/published/g1' },
        { id: 'g2', name: 'Gallery 2', deviationCount: 5, isPremium: true, isDefault: false, url: '/studio/published/g2' },
      ];
      store.dispatch(actions.setGalleries(galleries));

      expect(store.getState().galleries).toEqual(galleries);
    });
  });

  describe('SET_TIERS', () => {
    it('updates tiers', () => {
      const tiers: Tier[] = [
        { id: 't1', name: 'Bronze', deviationCount: 3, url: '/studio/tier/t1/deviations' },
      ];
      store.dispatch(actions.setTiers(tiers));

      expect(store.getState().tiers).toEqual(tiers);
    });
  });

  describe('MERGE_ITEMS', () => {
    it('adds new items without duplicating existing ones', () => {
      store.dispatch(actions.setItems([
        makeItem({ id: 'a' }),
        makeItem({ id: 'b' }),
      ]));

      store.dispatch(actions.mergeItems([
        makeItem({ id: 'b' }),  // duplicate
        makeItem({ id: 'c' }),  // new
      ]));

      const items = store.getState().items;
      expect(items).toHaveLength(3);
      expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    });

    it('merges into empty items list', () => {
      store.dispatch(actions.mergeItems([makeItem({ id: 'x' })]));
      expect(store.getState().items).toHaveLength(1);
    });
  });

  describe('REMOVE_ITEMS', () => {
    it('removes items by ID', () => {
      store.dispatch(actions.setItems([
        makeItem({ id: 'a' }),
        makeItem({ id: 'b' }),
        makeItem({ id: 'c' }),
      ]));

      store.dispatch(actions.removeItems(['a', 'c']));

      const items = store.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('b');
    });

    it('also removes from selectedIds', () => {
      store.dispatch(actions.setItems([
        makeItem({ id: 'a' }),
        makeItem({ id: 'b' }),
      ]));
      store.dispatch(actions.setSelection(['a', 'b']));
      store.dispatch(actions.removeItems(['a']));

      expect(store.getState().selectedIds).toEqual(['b']);
    });

    it('does not fail when removing non-existent IDs', () => {
      store.dispatch(actions.setItems([makeItem({ id: 'a' })]));
      store.dispatch(actions.removeItems(['z']));

      expect(store.getState().items).toHaveLength(1);
    });
  });

  describe('subscribe', () => {
    it('fires callback when the selected value changes', () => {
      const callback = vi.fn();
      store.subscribe((s) => s.items.length, callback);

      store.dispatch(actions.setItems([makeItem({ id: 'a' })]));

      expect(callback).toHaveBeenCalledWith(1);
    });

    it('does not fire for unrelated state changes', () => {
      const callback = vi.fn();
      store.subscribe((s) => s.items.length, callback);

      // Change galleries, not items
      store.dispatch(actions.setGalleries([
        { id: 'g1', name: 'G1', deviationCount: 0, isPremium: false, isDefault: false, url: '/g1' },
      ]));

      expect(callback).not.toHaveBeenCalled();
    });

    it('unsubscribe stops future callbacks', () => {
      const callback = vi.fn();
      const unsub = store.subscribe((s) => s.selectedIds.length, callback);

      store.dispatch(actions.setItems([makeItem({ id: 'a' })]));
      store.dispatch(actions.toggleSelection('a'));
      expect(callback).toHaveBeenCalledOnce();

      unsub();
      store.dispatch(actions.toggleSelection('a'));
      expect(callback).toHaveBeenCalledOnce(); // still 1
    });

    it('fires with the new selected value', () => {
      const values: number[] = [];
      store.subscribe(
        (s) => s.selectedIds.length,
        (v) => values.push(v),
      );

      store.dispatch(actions.setItems([makeItem({ id: 'a' }), makeItem({ id: 'b' })]));
      store.dispatch(actions.selectAll());
      store.dispatch(actions.deselectAll());

      expect(values).toEqual([2, 0]);
    });
  });
});
