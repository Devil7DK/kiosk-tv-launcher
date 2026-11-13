import type { RemoteKey } from '@kiosk-tv/shared';

/** Focus in rows of items; each row remembers its column for when focus returns. */
export interface GridFocus {
  row: number;
  columns: number[];
}

export const startFocus = (row = 0): GridFocus => ({ row, columns: [] });

export function columnOf(focus: GridFocus, row = focus.row): number {
  return focus.columns[row] ?? 0;
}

/** Up to the row of tabs, onto `column`: the screen's own tab. Rows keep their columns. */
export function toTabs(focus: GridFocus, column: number): GridFocus {
  const columns = [...focus.columns];
  columns[0] = column;
  return { row: 0, columns };
}

/** Skips empty rows; returns the same focus when the key leads nowhere. */
export function moveFocus(
  focus: GridFocus,
  key: RemoteKey,
  rowLengths: readonly number[],
): GridFocus {
  const step = (direction: 1 | -1): GridFocus => {
    for (
      let row = focus.row + direction;
      row >= 0 && row < rowLengths.length;
      row += direction
    ) {
      if ((rowLengths[row] ?? 0) > 0) return { ...focus, row };
    }
    return focus;
  };
  const shift = (by: 1 | -1): GridFocus => {
    const length = rowLengths[focus.row] ?? 0;
    const column = Math.min(columnOf(focus) + by, length - 1);
    if (column < 0 || column === columnOf(focus)) return focus;
    const columns = [...focus.columns];
    columns[focus.row] = column;
    return { ...focus, columns };
  };
  switch (key) {
    case 'up':
      return step(-1);
    case 'down':
      return step(1);
    case 'left':
      return shift(-1);
    case 'right':
      return shift(1);
    default:
      return focus;
  }
}

/**
 * Keeps each row's focus on the same item when new data reorders the row, as
 * when the show just watched moves to the front of Continue watching. A row
 * whose item is gone keeps its position.
 */
export function followItems(
  focus: GridFocus,
  before: readonly (readonly string[])[],
  after: readonly (readonly string[])[],
): GridFocus {
  const columns = focus.columns.map((column, row) => {
    const key = before[row]?.[column];
    const moved = key === undefined ? -1 : (after[row]?.indexOf(key) ?? -1);
    return moved >= 0 ? moved : column;
  });
  return { ...focus, columns };
}

/** Keeps focus inside rows that shrank or vanished after new data arrived. */
export function clampFocus(
  focus: GridFocus,
  rowLengths: readonly number[],
): GridFocus {
  if (rowLengths.length === 0) return focus;
  let row = Math.min(focus.row, rowLengths.length - 1);
  while (row > 0 && (rowLengths[row] ?? 0) === 0) row--;
  const columns = focus.columns.map((c, r) =>
    Math.max(0, Math.min(c, (rowLengths[r] ?? 1) - 1)),
  );
  return { row, columns };
}
