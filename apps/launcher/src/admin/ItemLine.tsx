import { type CatalogItem, isPlayable, type Playlist } from '@kiosk-tv/shared';

import { itemName, itemSubtitle } from '../navigation/navigation';

/** One show or video with the actions the admin page offers for it. */
export function ItemLine({
  item,
  playlists,
  onFollow,
  onAddTo,
}: {
  item: CatalogItem;
  playlists: Playlist[];
  onFollow: (item: CatalogItem) => void;
  onAddTo: (playlistId: string, item: CatalogItem) => void;
}) {
  const manual = playlists.filter((p) => p.source.type === 'manual');
  const image = item.artwork.landscape;
  return (
    <li>
      {image ? (
        <img class='thumb' src={image.url} alt='' loading='lazy' />
      ) : (
        <span class='thumb' />
      )}
      <div class='grow'>
        <div>{itemName(item)}</div>
        {itemSubtitle(item) && <div class='muted'>{itemSubtitle(item)}</div>}
      </div>
      {!isPlayable(item) && item.kind === 'series' && (
        <button onClick={() => onFollow(item)}>+ My shows</button>
      )}
      {manual.length > 0 && (
        <select
          value=''
          onChange={(event) => {
            const id = event.currentTarget.value;
            if (id) onAddTo(id, item);
          }}
        >
          <option value=''>+ Playlist…</option>
          {manual.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}
