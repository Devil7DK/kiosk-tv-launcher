import type { CatalogItem, Playable, Title } from '@kiosk-tv/shared';
import { isPlayable, refKey } from '@kiosk-tv/shared';

import type { Tab } from '../components/TopBar';

export type Route =
  | { kind: 'home' }
  | { kind: 'provider'; id: string }
  | { kind: 'title'; title: Title }
  | { kind: 'upNext'; finished: Playable; next: Playable }
  | { kind: 'notice'; title: string; detail?: string };

/** A screen keeps what it loaded while its key stays, so the key names what it shows. */
export function screenKey(route: Route, index: number): string {
  switch (route.kind) {
    case 'provider':
      return `${index}:provider:${route.id}`;
    case 'title':
      return `${index}:title:${refKey(route.title.ref)}`;
    default:
      return `${index}:${route.kind}`;
  }
}

export interface Navigation {
  tabs: Tab[];
  /** The tab a screen belongs to, highlighted in the top bar. */
  tab: string;
  switchTab(id: string): void;
  openSettings(): void;
  open(route: Route): void;
  back(): void;
  play(playable: Playable, fromStart?: boolean): void;
}

/** Plays what plays, opens what opens. */
export function choose(navigation: Navigation, item: CatalogItem): void {
  if (isPlayable(item)) navigation.play(item);
  else navigation.open({ kind: 'title', title: item });
}

/** Episodes go by their show's name; films and videos by their own title. */
export function itemName(item: CatalogItem): string {
  if (!isPlayable(item)) return item.name;
  return item.kind === 'episode'
    ? (item.parent?.name ?? item.title)
    : item.title;
}

/**
 * The second line: the episode's own title, or the channel a video is from.
 * Left out on a row that already is that channel.
 */
export function itemSubtitle(
  item: CatalogItem,
  row?: string,
): string | undefined {
  if (!isPlayable(item)) return undefined;
  if (item.kind === 'episode') return item.parent ? item.title : undefined;
  if (item.kind === 'video') {
    if (item.parent && item.parent.ref.id === row) return undefined;
    return item.parent?.name ?? item.description;
  }
  return undefined;
}
