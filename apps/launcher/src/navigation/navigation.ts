import type { CatalogItem, Playable, Title } from '@kiosk-tv/shared';
import { isPlayable } from '@kiosk-tv/shared';

import type { Tab } from '../components/TopBar';

export type Route =
  | { kind: 'home' }
  | { kind: 'provider'; id: string }
  | { kind: 'title'; title: Title }
  | { kind: 'upNext'; finished: Playable; next: Playable }
  | { kind: 'notice'; title: string; detail?: string };

export interface Navigation {
  tabs: Tab[];
  /** The tab a screen belongs to, highlighted in the top bar. */
  tab: string;
  switchTab(id: string): void;
  open(route: Route): void;
  back(): void;
  play(playable: Playable, fromStart?: boolean): void;
}

/** Plays what plays, opens what opens. */
export function choose(navigation: Navigation, item: CatalogItem): void {
  if (isPlayable(item)) navigation.play(item);
  else navigation.open({ kind: 'title', title: item });
}

export function itemName(item: CatalogItem): string {
  return isPlayable(item) ? (item.parent?.name ?? item.title) : item.name;
}

export function itemSubtitle(item: CatalogItem): string | undefined {
  return isPlayable(item) && item.parent ? item.title : undefined;
}
