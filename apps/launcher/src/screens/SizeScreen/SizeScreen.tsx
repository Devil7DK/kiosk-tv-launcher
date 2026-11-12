import './SizeScreen.css';

import { useState } from 'preact/hooks';

import { adminApi } from '../../api/api.client';
import { Button } from '../../components/Button';
import { TopBar } from '../../components/TopBar';
import { columnOf, moveFocus, startFocus } from '../../focus/grid-focus';
import type { Navigation } from '../../navigation/navigation';
import { useRemote } from '../../remote/useRemote';

export const SIZE_STEP = 0.1;
export const SMALLEST = 0.6;
export const LARGEST = 1.6;

/** One step smaller or larger, kept within what the screen can show. */
export function nextScale(scale: number, direction: 1 | -1): number {
  const next = Math.round((scale + direction * SIZE_STEP) * 10) / 10;
  return Math.min(LARGEST, Math.max(SMALLEST, next));
}

/** Lets the viewer make everything larger or smaller with the remote. */
export function SizeScreen({
  scale,
  navigation,
  active,
}: {
  scale: number;
  navigation: Navigation;
  active: boolean;
}) {
  const sizeTab = navigation.tabs.findIndex((t) => t.id === 'size');
  const [focus, setFocus] = useState(() => ({
    ...startFocus(1),
    columns: [sizeTab],
  }));
  const lengths = [navigation.tabs.length, 2];

  useRemote((key) => {
    if (key === 'back') return;
    if (key !== 'ok') return setFocus((f) => moveFocus(f, key, lengths));
    const column = columnOf(focus);
    if (focus.row === 0)
      return navigation.switchTab(navigation.tabs[column]!.id);
    void adminApi.settings({ scale: nextScale(scale, column === 0 ? -1 : 1) });
  }, active);

  return (
    <>
      <TopBar
        tabs={navigation.tabs}
        selected='size'
        focusedIndex={active && focus.row === 0 ? columnOf(focus) : undefined}
      />
      <div class='size'>
        <p class='size-sample'>
          Press OK on Smaller or Bigger until the writing is easy to read.
        </p>
        <div class='size-buttons'>
          <Button
            label='Smaller'
            focused={active && focus.row === 1 && columnOf(focus) === 0}
          />
          <span class='size-value'>{Math.round(scale * 100)}%</span>
          <Button
            label='Bigger'
            focused={active && focus.row === 1 && columnOf(focus) === 1}
          />
        </div>
      </div>
    </>
  );
}
