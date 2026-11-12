import './TopBar.css';

import { useEffect, useRef } from 'preact/hooks';

export interface Tab {
  id: string;
  label: string;
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
    </nav>
  );
}
