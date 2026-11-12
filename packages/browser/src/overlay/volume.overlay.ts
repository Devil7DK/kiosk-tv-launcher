import type { Page } from 'playwright-core';

export interface VolumeLevel {
  /** 0 to 100. */
  percent: number;
  muted: boolean;
}

const SPEAKER =
  'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z';
const MUTED =
  'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z';

/**
 * Runs inside whatever page is in front, a service's player included, so it
 * uses only what every page has: no markup strings (YouTube refuses them) and
 * no style sheets (a site's rules may block them), only inline styles.
 */
function drawVolume({
  percent,
  muted,
  speaker,
  mutedIcon,
}: VolumeLevel & { speaker: string; mutedIcon: string }) {
  const ID = '__kioskTvVolume';
  const SVG = 'http://www.w3.org/2000/svg';
  const style = (element: Element, rules: Record<string, string>) => {
    for (const [name, value] of Object.entries(rules))
      (element as HTMLElement).style.setProperty(name, value, 'important');
  };
  type Overlay = HTMLElement & { hideTimer?: number };
  let overlay = document.getElementById(ID) as Overlay | null;
  if (!overlay) {
    overlay = document.createElement('div') as Overlay;
    overlay.id = ID;
    overlay.setAttribute('popover', 'manual');
    style(overlay, {
      position: 'fixed',
      inset: 'auto auto 8vh 50%',
      transform: 'translateX(-50%)',
      margin: '0',
      padding: '2.2vh 3vh',
      border: 'none',
      'border-radius': '2vh',
      background: 'rgba(16, 17, 20, 0.9)',
      width: '42vw',
      'box-sizing': 'border-box',
      'pointer-events': 'none',
    });
    const icon = document.createElementNS(SVG, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    style(icon, { width: '7vh', height: '7vh', flex: '0 0 auto' });
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('fill', '#f4f1ea');
    icon.append(path);
    const track = document.createElement('div');
    style(track, {
      flex: '1 1 auto',
      height: '2.6vh',
      'border-radius': '1.3vh',
      background: 'rgba(244, 241, 234, 0.25)',
      overflow: 'hidden',
    });
    const fill = document.createElement('div');
    fill.dataset.level = '';
    style(fill, { height: '100%', 'border-radius': '1.3vh' });
    track.append(fill);
    // The popover itself keeps the browser's display, which is what hides it.
    const row = document.createElement('div');
    style(row, { display: 'flex', 'align-items': 'center', gap: '2.5vh' });
    row.append(icon, track);
    overlay.append(row);
    document.body.append(overlay);
  }
  const path = overlay.querySelector('path')!;
  path.setAttribute('d', muted ? mutedIcon : speaker);
  const fill = overlay.querySelector<HTMLElement>('[data-level]')!;
  style(fill, {
    width: `${Math.max(0, Math.min(100, percent))}%`,
    background: muted ? '#8a867e' : '#ffd400',
  });
  // Shown again on every change, so it stays above a video that went full
  // screen after it appeared: the newest entry of the top layer is drawn last.
  if (overlay.matches(':popover-open')) overlay.hidePopover();
  overlay.showPopover();
  window.clearTimeout(overlay.hideTimer);
  const shown = overlay;
  overlay.hideTimer = window.setTimeout(() => shown.hidePopover(), 2000);
}

/** Shows the volume over `page` for two seconds. */
export async function showVolume(
  page: Page,
  volume: VolumeLevel,
): Promise<void> {
  await page.evaluate(drawVolume, {
    ...volume,
    speaker: SPEAKER,
    mutedIcon: MUTED,
  });
}
