import './TopBar.css';

import { useContext, useEffect, useRef } from 'preact/hooks';

import { RemoteStatusContext, TvBatteryContext } from '../../app/tv-status';
import { BatteryIcon } from '../BatteryIcon';

export interface Tab {
  id: string;
  label: string;
}

/** The tabs, then the settings button and, where the TV allows it, the power button. */
export function topBarLength(tabs: readonly Tab[], power: boolean): number {
  return tabs.length + (power ? 2 : 1);
}

export function isSettings(tabs: readonly Tab[], column: number): boolean {
  return column === tabs.length;
}

export function isPower(tabs: readonly Tab[], column: number): boolean {
  return column === tabs.length + 1;
}

function iconClass(name: string, focused: boolean): string {
  return `top-bar-icon ${name}${focused ? ' focused' : ''}`;
}

export function TopBar({
  tabs,
  selected,
  focusedIndex,
  power,
}: {
  tabs: Tab[];
  selected: string;
  focusedIndex: number | undefined;
  power: boolean;
}) {
  const element = useRef<HTMLElement>(null);
  const remote = useContext(RemoteStatusContext);
  const battery = useContext(TvBatteryContext);
  useEffect(() => {
    if (focusedIndex === undefined) return;
    element.current?.scrollIntoView({ block: 'start' });
    element.current
      ?.querySelector('.focused')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focusedIndex]);
  return (
    <nav ref={element} class='top-bar'>
      {tabs.map((tab, index) => (
        <span
          key={tab.id}
          class={[
            'top-bar-tab',
            tab.id === selected && 'selected',
            index === focusedIndex && 'focused',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {tab.label}
        </span>
      ))}
      <span class='top-bar-spacer' />
      {remote.batteryLow && (
        <span class='top-bar-notice'>Charge the remote</span>
      )}
      {battery && <BatteryIcon battery={battery} />}
      <span
        class={iconClass('top-bar-settings', focusedIndex === tabs.length)}
        aria-label='Settings'
      >
        <svg viewBox='0 0 24 24' aria-hidden='true'>
          <path d='M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.3 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.3-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z' />
        </svg>
      </span>
      {power && (
        <span
          class={iconClass('top-bar-power', focusedIndex === tabs.length + 1)}
          aria-label='Turn off'
        >
          <svg viewBox='0 0 24 24' aria-hidden='true'>
            <path d='M13 3h-2v10h2zm4.83 2.17-1.42 1.42A6.92 6.92 0 0 1 19 12a7 7 0 1 1-11.41-5.41L6.17 5.17A8.93 8.93 0 0 0 3 12a9 9 0 0 0 18 0 8.93 8.93 0 0 0-3.17-6.83z' />
          </svg>
        </span>
      )}
    </nav>
  );
}
