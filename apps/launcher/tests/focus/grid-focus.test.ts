import { describe, expect, it } from 'vitest';

import {
  clampFocus,
  columnOf,
  followItems,
  moveFocus,
  startFocus,
  toTabs,
} from '../../src/focus/grid-focus';

describe('moveFocus', () => {
  it('returns to the column a row was left at', () => {
    let focus = startFocus();
    focus = moveFocus(focus, 'right', [5, 5]);
    focus = moveFocus(focus, 'right', [5, 5]);
    focus = moveFocus(focus, 'down', [5, 5]);
    focus = moveFocus(focus, 'up', [5, 5]);
    expect(columnOf(focus)).toBe(2);
  });

  it('jumps over rows with nothing in them', () => {
    expect(moveFocus(startFocus(), 'down', [3, 0, 4]).row).toBe(2);
  });

  it('stays put at the edges instead of wrapping around', () => {
    const focus = startFocus();
    expect(moveFocus(focus, 'left', [3])).toBe(focus);
    expect(moveFocus(focus, 'up', [3])).toBe(focus);
  });
});

describe('clampFocus', () => {
  it('pulls focus back into a row that became shorter', () => {
    const focus = { row: 1, columns: [0, 7] };
    expect(clampFocus(focus, [2, 3])).toEqual({ row: 1, columns: [0, 2] });
  });

  it('moves focus up when its row disappeared', () => {
    expect(clampFocus({ row: 3, columns: [] }, [2, 2]).row).toBe(1);
  });
});

describe('toTabs', () => {
  it('takes Back from a row up to the screen’s own tab, keeping each row’s place', () => {
    const inRow = { row: 2, columns: [3, 1, 4] };
    expect(toTabs(inRow, 1)).toEqual({ row: 0, columns: [1, 1, 4] });
  });
});

describe('followItems', () => {
  it('keeps focus on the show just watched when it moves to the front', () => {
    const before = [[], ['moondru', 'sembaruthi', 'trek']];
    const after = [[], ['sembaruthi', 'moondru', 'trek']];
    const focus = { row: 1, columns: [0, 1] };
    expect(followItems(focus, before, after)).toEqual({
      row: 1,
      columns: [0, 0],
    });
  });

  it('keeps the position in a row whose item is gone', () => {
    const focus = { row: 1, columns: [0, 2] };
    expect(followItems(focus, [[], ['a', 'b', 'c']], [[], ['a', 'b']])).toEqual(
      focus,
    );
  });
});
