import './BatteryIcon.css';

import type { TvBattery } from '@kiosk-tv/shared';

export const LOW_PERCENT = 15;

/** Width of the level bar inside the outline, in the icon's own units. */
export function levelWidth(percent: number): number {
  const inside = 19;
  return (
    Math.round((Math.min(100, Math.max(0, percent)) / 100) * inside * 10) / 10
  );
}

export function isLow(battery: TvBattery): boolean {
  return !battery.charging && battery.percent <= LOW_PERCENT;
}

/** The laptop's battery as a picture: the bar is the level, the bolt the charger. */
export function BatteryIcon({ battery }: { battery: TvBattery }) {
  return (
    <span
      class={isLow(battery) ? 'battery-icon low' : 'battery-icon'}
      role='img'
      aria-label={`Battery ${battery.percent}%${battery.charging ? ', charging' : ''}`}
    >
      <svg viewBox='0 0 28 16' aria-hidden='true'>
        <rect
          class='battery-outline'
          x='1'
          y='1.5'
          width='23'
          height='13'
          rx='2.5'
        />
        <rect
          class='battery-tip'
          x='24.5'
          y='5.5'
          width='2.5'
          height='5'
          rx='1'
        />
        <rect
          class='battery-level'
          x='3'
          y='3.5'
          width={levelWidth(battery.percent)}
          height='9'
          rx='1'
        />
        {battery.charging && (
          <path
            class='battery-bolt'
            d='M15.4 2.9 9 9.1h3.7l-1.6 4 6.3-6.4h-3.7z'
          />
        )}
      </svg>
    </span>
  );
}
