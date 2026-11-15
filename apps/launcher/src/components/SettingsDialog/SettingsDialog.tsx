import './SettingsDialog.css';

import { DIMMEST_PERCENT } from '@kiosk-tv/shared';
import { useEffect, useState } from 'preact/hooks';

import { adminApi, api } from '../../api/api.client';
import { useRemote } from '../../remote/useRemote';
import { Button } from '../Button';

export const SIZE_STEP = 0.1;
export const SMALLEST = 0.6;
export const LARGEST = 1.6;
export const BRIGHTNESS_STEP = 10;

/** One step smaller or larger, kept within what the screen can show. */
export function nextScale(scale: number, direction: 1 | -1): number {
  const next = Math.round((scale + direction * SIZE_STEP) * 10) / 10;
  return Math.min(LARGEST, Math.max(SMALLEST, next));
}

/** To the next step below or above, so 43% goes to 40% or 50%. */
export function nextBrightness(percent: number, direction: 1 | -1): number {
  const steps = percent / BRIGHTNESS_STEP;
  const next =
    (direction === 1 ? Math.floor(steps) + 1 : Math.ceil(steps) - 1) *
    BRIGHTNESS_STEP;
  return Math.min(100, Math.max(DIMMEST_PERCENT, next));
}

type Row = 'size' | 'brightness' | 'done';
/** 0 for the left button of a row, 1 for the right. */
type Side = 0 | 1;

/** Settings the viewer can change with the remote, over whatever screen is open. */
export function SettingsDialog({
  scale,
  onClose,
}: {
  scale: number;
  onClose: () => void;
}) {
  const [row, setRow] = useState<Row>('size');
  const [side, setSide] = useState<Side>(1);
  const [brightness, setBrightness] = useState<number | undefined>();

  useEffect(() => {
    api.brightness().then(
      (status) => setBrightness(status.percent),
      () => {},
    );
  }, []);

  const rows: Row[] =
    brightness === undefined
      ? ['size', 'done']
      : ['size', 'brightness', 'done'];
  const move = (by: 1 | -1) => {
    const next = rows[rows.indexOf(row) + by];
    if (next) setRow(next);
  };

  const changeBrightness = (from: number) => {
    const percent = nextBrightness(from, side === 0 ? -1 : 1);
    setBrightness(percent);
    // Answers to quick presses can arrive out of order; only a failure is news.
    api.setBrightness(percent).catch(() =>
      api.brightness().then(
        (status) => setBrightness(status.percent),
        () => {},
      ),
    );
  };

  useRemote((key) => {
    if (key === 'back') return onClose();
    if (key === 'left' && row !== 'done') setSide(0);
    else if (key === 'right' && row !== 'done') setSide(1);
    else if (key === 'down') move(1);
    else if (key === 'up') move(-1);
    else if (key === 'ok') {
      if (row === 'done') return onClose();
      if (row === 'brightness' && brightness !== undefined)
        return changeBrightness(brightness);
      void adminApi.settings({
        scale: nextScale(scale, side === 0 ? -1 : 1),
      });
    }
  });

  return (
    <div class='dialog-backdrop'>
      <div class='dialog' role='dialog' aria-label='Settings'>
        <h2>Settings</h2>
        <div class='dialog-label'>Size of everything on the screen</div>
        <div class='dialog-size'>
          <Button label='Smaller' focused={row === 'size' && side === 0} />
          <span class='dialog-size-value'>{Math.round(scale * 100)}%</span>
          <Button label='Bigger' focused={row === 'size' && side === 1} />
        </div>
        {brightness !== undefined && (
          <>
            <div class='dialog-label dialog-gap'>Brightness of the screen</div>
            <div class='dialog-size'>
              <Button
                label='Dimmer'
                focused={row === 'brightness' && side === 0}
              />
              <span class='dialog-size-value'>{brightness}%</span>
              <Button
                label='Brighter'
                focused={row === 'brightness' && side === 1}
              />
            </div>
          </>
        )}
        <div class='dialog-done'>
          <Button label='Done' focused={row === 'done'} />
        </div>
      </div>
    </div>
  );
}
