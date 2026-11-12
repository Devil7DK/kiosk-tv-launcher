import type { Home } from '@kiosk-tv/shared';
import { useEffect, useState } from 'preact/hooks';

import { api } from '../../api/api.client';
import { useLoad } from '../../api/useLoad';
import { Message } from '../../components/Message';
import { Row } from '../../components/Row';
import { Tile } from '../../components/Tile';
import {
  isPower,
  isSettings,
  TopBar,
  topBarLength,
} from '../../components/TopBar';
import {
  clampFocus,
  columnOf,
  moveFocus,
  startFocus,
} from '../../focus/grid-focus';
import { progressLabel } from '../../format/format';
import {
  choose,
  itemName,
  itemSubtitle,
  type Navigation,
} from '../../navigation/navigation';
import { useRemote } from '../../remote/useRemote';

function rowsOf(home: Home | undefined, tabs: number): number[] {
  if (!home) return [tabs];
  return [
    tabs,
    home.continueWatching.length,
    home.myShows.length,
    ...home.playlists.map((p) => p.items.length),
  ];
}

export function HomeScreen({
  navigation,
  active,
  version,
}: {
  navigation: Navigation;
  active: boolean;
  version: number;
}) {
  const loaded = useLoad(() => api.home(), version);
  const home = loaded.state === 'ready' ? loaded.value : undefined;
  const lengths = rowsOf(home, topBarLength(navigation.tabs, navigation.power));
  // Start on the first row with something to watch, not on the tabs.
  const [focus, setFocus] = useState(() => startFocus(1));
  useEffect(() => {
    if (home) setFocus((f) => clampFocus(f, lengths));
  }, [lengths.join()]);

  useRemote((key) => {
    if (key !== 'ok') {
      if (key !== 'back') setFocus((f) => moveFocus(f, key, lengths));
      return;
    }
    const column = columnOf(focus);
    if (focus.row === 0) {
      if (isSettings(navigation.tabs, column)) return navigation.openSettings();
      if (isPower(navigation.tabs, column)) return navigation.openPower();
      return navigation.switchTab(navigation.tabs[column]!.id);
    }
    if (!home) return;
    if (focus.row === 1) return navigation.play(home.continueWatching[column]!);
    if (focus.row === 2) {
      return navigation.open({
        kind: 'title',
        title: home.myShows[column]!.title,
      });
    }
    const item = home.playlists[focus.row - 3]?.items[column];
    if (item) choose(navigation, item);
  }, active);

  const at = (row: number, column: number) =>
    active && focus.row === row && columnOf(focus) === column;

  return (
    <>
      <TopBar
        tabs={navigation.tabs}
        power={navigation.power}
        selected='home'
        focusedIndex={active && focus.row === 0 ? columnOf(focus) : undefined}
      />
      {loaded.state === 'loading' && <Message title='Loading…' />}
      {loaded.state === 'failed' && (
        <Message title='The TV could not load its home screen'>
          {loaded.message}
        </Message>
      )}
      {home && (
        <>
          {home.continueWatching.length > 0 && (
            <Row title='Continue watching' focused={active && focus.row === 1}>
              {home.continueWatching.map((p, i) => (
                <Tile
                  key={`${p.ref.provider}:${p.ref.id}`}
                  title={itemName(p)}
                  subtitle={[itemSubtitle(p), progressLabel(p.progress)]
                    .filter(Boolean)
                    .join(' · ')}
                  artwork={p.artwork}
                  progress={p.progress}
                  focused={at(1, i)}
                />
              ))}
            </Row>
          )}
          {home.myShows.length > 0 && (
            <Row title='My shows' focused={active && focus.row === 2}>
              {home.myShows.map((show, i) => (
                <Tile
                  key={`${show.title.ref.provider}:${show.title.ref.id}`}
                  title={show.title.name}
                  subtitle={show.latest?.title}
                  artwork={
                    show.title.kind === 'channel' && show.latest
                      ? show.latest.artwork
                      : show.title.artwork
                  }
                  badge={show.hasNew ? 'NEW' : undefined}
                  focused={at(2, i)}
                />
              ))}
            </Row>
          )}
          {home.playlists.map((playlist, r) => (
            <Row
              key={playlist.id}
              title={playlist.name}
              focused={active && focus.row === r + 3}
            >
              {playlist.items.map((item, i) => (
                <Tile
                  key={`${item.ref.provider}:${item.ref.id}`}
                  title={itemName(item)}
                  subtitle={itemSubtitle(item)}
                  artwork={item.artwork}
                  focused={at(r + 3, i)}
                />
              ))}
            </Row>
          ))}
          {home.continueWatching.length +
            home.myShows.length +
            home.playlists.length ===
            0 && (
            <Message title='Nothing here yet'>
              Shows added from the phone page appear here.
            </Message>
          )}
        </>
      )}
    </>
  );
}
