import './TitleScreen.css';

import type { Playable, Title } from '@kiosk-tv/shared';
import { useEffect, useRef, useState } from 'preact/hooks';

import { api } from '../../api/api.client';
import { Button } from '../../components/Button';
import { EpisodeItem } from '../../components/EpisodeItem';
import { Message } from '../../components/Message';
import {
  clampFocus,
  columnOf,
  moveFocus,
  startFocus,
} from '../../focus/grid-focus';
import type { Navigation } from '../../navigation/navigation';
import { useRemote } from '../../remote/useRemote';

const AHEAD = 4;

type Action = { label: string; playable: Playable; fromStart?: boolean };

function updatedAt(p: Playable): number {
  return Date.parse(p.progress?.updatedAt ?? '') || 0;
}

/** Continue the episode watched last, if unfinished; otherwise offer the newest. */
export function actionsFor(episodes: readonly Playable[]): Action[] {
  const latest = episodes[0];
  if (!latest) return [];
  const started = episodes
    .filter(
      (e) => e.progress && !e.progress.completed && e.progress.fraction > 0,
    )
    .sort((a, b) => updatedAt(b) - updatedAt(a))[0];
  const actions: Action[] = [];
  if (started)
    actions.push({ label: `Continue ${started.title}`, playable: started });
  if (started !== latest)
    actions.push({ label: 'Play the latest', playable: latest });
  else actions.push({ label: 'Start over', playable: latest, fromStart: true });
  return actions;
}

export function TitleScreen({
  title,
  navigation,
  active,
  version,
}: {
  title: Title;
  navigation: Navigation;
  active: boolean;
  version: number;
}) {
  const [episodes, setEpisodes] = useState<Playable[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const busy = useRef(false);

  const load = (cursor?: string) => {
    if (busy.current) return;
    busy.current = true;
    api
      .episodes(title.ref, cursor)
      .then(
        (listing) => {
          setEpisodes((current) =>
            cursor ? [...current, ...listing.page.items] : listing.page.items,
          );
          setNext(listing.page.next);
          setState('ready');
        },
        () => setState((s) => (s === 'ready' ? s : 'failed')),
      )
      .finally(() => {
        busy.current = false;
      });
  };
  useEffect(() => load(), [title.ref.provider, title.ref.id, version]);

  const actions = actionsFor(episodes);
  const lengths = [actions.length, ...episodes.map(() => 1)];
  const [focus, setFocus] = useState(startFocus);
  useEffect(() => {
    if (state === 'ready') setFocus((f) => clampFocus(f, lengths));
  }, [lengths.join()]);
  useEffect(() => {
    if (next && focus.row >= episodes.length - AHEAD) load(next);
  }, [focus, next]);

  useRemote((key) => {
    if (key === 'back') return navigation.back();
    if (key !== 'ok') return setFocus((f) => moveFocus(f, key, lengths));
    if (focus.row === 0) {
      const action = actions[columnOf(focus)];
      if (action) navigation.play(action.playable, action.fromStart);
      return;
    }
    const episode = episodes[focus.row - 1];
    if (episode) navigation.play(episode);
  }, active);

  const backdrop = title.artwork.backdrop ?? title.artwork.landscape;
  return (
    <>
      <header
        class='title-header'
        style={
          backdrop ? { backgroundImage: `url("${backdrop.url}")` } : undefined
        }
      >
        <h1 class='title-name'>{title.name}</h1>
        {title.description && (
          <p class='title-description'>{title.description}</p>
        )}
        <div class='title-buttons'>
          {actions.map((action, i) => (
            <Button
              key={action.label}
              label={action.label}
              focused={active && focus.row === 0 && columnOf(focus) === i}
            />
          ))}
        </div>
      </header>
      {state === 'loading' && <Message title='Loading episodes…' />}
      {state === 'failed' && (
        <Message title='The episodes could not be loaded' />
      )}
      {state === 'ready' && episodes.length === 0 && (
        <Message title='No episodes yet' />
      )}
      {episodes.map((episode, i) => (
        <EpisodeItem
          key={`${episode.ref.provider}:${episode.ref.id}`}
          episode={episode}
          focused={active && focus.row === i + 1}
        />
      ))}
    </>
  );
}
