import {
  type CatalogItem,
  isPlayable,
  type Playable,
  type Playlist,
  type Ref,
  refKey,
} from '@kiosk-tv/shared';

import { itemName, itemSubtitle } from '../navigation/navigation';

/**
 * What "+ My shows" adds for an item: the show itself, or the show or channel
 * an episode or video belongs to. Films and playlists are not followed.
 */
export function followTarget(
  item: CatalogItem,
): { ref: Ref; label: string } | undefined {
  if (!isPlayable(item)) {
    return item.kind === 'playlist'
      ? undefined
      : { ref: item.ref, label: '+ My shows' };
  }
  if (!item.parent) return undefined;
  return {
    ref: item.parent.ref,
    label: item.kind === 'video' ? '+ Channel to My shows' : '+ My shows',
  };
}

/** One show or video with the actions the admin page offers for it. */
export function ItemLine({
  item,
  playlists,
  followed,
  onFollow,
  onAddTo,
  onPlay,
}: {
  item: CatalogItem;
  playlists: Playlist[];
  /** Ref keys of the shows and channels already in My shows. */
  followed: ReadonlySet<string>;
  onFollow: (item: CatalogItem) => void;
  onAddTo: (playlistId: string, item: CatalogItem) => void;
  /** Offered for what can be played: an episode, a video or a film. */
  onPlay?: (playable: Playable) => void;
}) {
  const manual = playlists.filter((p) => p.source.type === 'manual');
  const target = followTarget(item);
  const image = item.artwork.landscape;
  return (
    <li class='item-line'>
      {image ? (
        <img class='thumb' src={image.url} alt='' loading='lazy' />
      ) : (
        <span class='thumb' />
      )}
      <div class='grow'>
        <div>{itemName(item)}</div>
        {itemSubtitle(item) && <div class='muted'>{itemSubtitle(item)}</div>}
      </div>
      {onPlay && isPlayable(item) && (
        <button class='primary' onClick={() => onPlay(item)}>
          Play on TV
        </button>
      )}
      {target &&
        (followed.has(refKey(target.ref)) ? (
          <span class='muted'>In My shows</span>
        ) : (
          <button onClick={() => onFollow(item)}>{target.label}</button>
        ))}
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
