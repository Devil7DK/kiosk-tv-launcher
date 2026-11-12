import {
  type CatalogItem,
  type Library,
  type Playlist,
  refKey,
} from '@kiosk-tv/shared';
import { useState } from 'preact/hooks';

import { adminApi } from '../api/api.client';
import { itemName, itemSubtitle } from '../navigation/navigation';

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  const [moved] = copy.splice(from, 1);
  if (moved !== undefined) copy.splice(to, 0, moved);
  return copy;
}

function PlaylistEditor({
  playlist,
  index,
  count,
  onChange,
}: {
  playlist: Playlist;
  index: number;
  count: number;
  onChange: (change: Promise<Library>) => void;
}) {
  const items: CatalogItem[] =
    playlist.source.type === 'manual' ? playlist.source.items : [];
  const setItems = (next: CatalogItem[]) =>
    onChange(adminApi.updatePlaylist(playlist.id, { items: next }));
  return (
    <div class='playlist'>
      <div class='row-form'>
        <strong class='grow'>{playlist.name}</strong>
        <button
          disabled={index === 0}
          onClick={() =>
            onChange(
              adminApi.updatePlaylist(playlist.id, { position: index - 1 }),
            )
          }
        >
          ↑
        </button>
        <button
          disabled={index === count - 1}
          onClick={() =>
            onChange(
              adminApi.updatePlaylist(playlist.id, { position: index + 1 }),
            )
          }
        >
          ↓
        </button>
        <button
          onClick={() => {
            const name = prompt('New name', playlist.name)?.trim();
            if (name) onChange(adminApi.updatePlaylist(playlist.id, { name }));
          }}
        >
          Rename
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete the playlist "${playlist.name}"?`)) {
              onChange(adminApi.deletePlaylist(playlist.id));
            }
          }}
        >
          Delete
        </button>
      </div>
      {playlist.source.type === 'provider' ? (
        <p class='muted'>
          Kept in step with “{playlist.source.title.name}” on the service.
        </p>
      ) : items.length === 0 ? (
        <p class='muted'>Empty. Add items below, under “Add from a service”.</p>
      ) : (
        <ul>
          {items.map((item, i) => (
            <li key={refKey(item.ref)}>
              <div class='grow'>
                <div>{itemName(item)}</div>
                {itemSubtitle(item) && (
                  <div class='muted'>{itemSubtitle(item)}</div>
                )}
              </div>
              <button
                disabled={i === 0}
                onClick={() => setItems(move(items, i, i - 1))}
              >
                ↑
              </button>
              <button
                disabled={i === items.length - 1}
                onClick={() => setItems(move(items, i, i + 1))}
              >
                ↓
              </button>
              <button onClick={() => setItems(items.filter((_, j) => j !== i))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PlaylistsSection({
  library,
  onChange,
}: {
  library: Library;
  onChange: (change: Promise<Library>) => void;
}) {
  const [name, setName] = useState('');
  return (
    <section>
      <h2>Playlists</h2>
      <p class='muted'>Each playlist is a row on the TV’s home screen.</p>
      <form
        class='row-form'
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onChange(
            adminApi.createPlaylist({
              name: name.trim(),
              source: { type: 'manual', items: [] },
            }),
          );
          setName('');
        }}
      >
        <input
          class='grow'
          value={name}
          placeholder='New playlist name'
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <button class='primary' type='submit'>
          Create
        </button>
      </form>
      {library.playlists.map((playlist, index) => (
        <PlaylistEditor
          key={playlist.id}
          playlist={playlist}
          index={index}
          count={library.playlists.length}
          onChange={onChange}
        />
      ))}
    </section>
  );
}
