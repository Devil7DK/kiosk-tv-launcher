import './TopBar.css';

import { useContext, useEffect, useRef } from 'preact/hooks';

import { RemoteStatusContext } from '../../app/tv-status';

export interface Tab {
  id: string;
  label: string;
}

/** The tabs, then the settings button at the end of the same row. */
export function topBarLength(tabs: readonly Tab[]): number {
  return tabs.length + 1;
}

export function isSettings(tabs: readonly Tab[], column: number): boolean {
  return column === tabs.length;
}

export function TopBar({
  tabs,
  selected,
  focusedIndex,
}: {
  tabs: Tab[];
  selected: string;
  focusedIndex: number | undefined;
}) {
  const element = useRef<HTMLElement>(null);
  const remote = useContext(RemoteStatusContext);
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
      {remote.batteryLow && (
        <span class='top-bar-notice'>Charge the remote</span>
      )}
      <span
        class={
          focusedIndex === tabs.length
            ? 'top-bar-settings focused'
            : 'top-bar-settings'
        }
        aria-label='Settings'
      >
        <svg viewBox='0 0 24 24' aria-hidden='true'>
          <path d='M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.3 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.3-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z' />
        </svg>
      </span>
    </nav>
  );
}
