import './SettingsDialog.css';

import { useState } from 'preact/hooks';

import { adminApi } from '../../api/api.client';
import { useRemote } from '../../remote/useRemote';
import { Button } from '../Button';

export const SIZE_STEP = 0.1;
export const SMALLEST = 0.6;
export const LARGEST = 1.6;

/** One step smaller or larger, kept within what the screen can show. */
export function nextScale(scale: number, direction: 1 | -1): number {
  const next = Math.round((scale + direction * SIZE_STEP) * 10) / 10;
  return Math.min(LARGEST, Math.max(SMALLEST, next));
}

type Focus = 'smaller' | 'bigger' | 'done';

/** Settings the viewer can change with the remote, over whatever screen is open. */
export function SettingsDialog({
  scale,
  onClose,
}: {
  scale: number;
  onClose: () => void;
}) {
  const [focus, setFocus] = useState<Focus>('bigger');

  useRemote((key) => {
    if (key === 'back') return onClose();
    if (key === 'left' && focus === 'bigger') setFocus('smaller');
    else if (key === 'right' && focus === 'smaller') setFocus('bigger');
    else if (key === 'down') setFocus('done');
    else if (key === 'up' && focus === 'done') setFocus('bigger');
    else if (key === 'ok') {
      if (focus === 'done') return onClose();
      void adminApi.settings({
        scale: nextScale(scale, focus === 'smaller' ? -1 : 1),
      });
    }
  });

  return (
    <div class='dialog-backdrop'>
      <div class='dialog' role='dialog' aria-label='Settings'>
        <h2>Settings</h2>
        <div class='dialog-label'>Size of everything on the screen</div>
        <div class='dialog-size'>
          <Button label='Smaller' focused={focus === 'smaller'} />
          <span class='dialog-size-value'>{Math.round(scale * 100)}%</span>
          <Button label='Bigger' focused={focus === 'bigger'} />
        </div>
        <div class='dialog-done'>
          <Button label='Done' focused={focus === 'done'} />
        </div>
      </div>
    </div>
  );
}
