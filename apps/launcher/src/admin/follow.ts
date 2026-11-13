import type { CatalogItem, Library } from '@kiosk-tv/shared';

import { adminApi, api } from '../api/api.client';

/** Adds the item to My shows: a show itself, or the show or channel an episode or video is from. */
export function followItem(item: CatalogItem): Promise<Library> | undefined {
  if ('name' in item) return adminApi.follow(item);
  const parent = item.parent;
  if (!parent) return undefined;
  return api.title(parent.ref).then((title) => adminApi.follow(title));
}
