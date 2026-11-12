import './EpisodeItem.css';

import type { Playable } from '@kiosk-tv/shared';
import { useEffect, useRef } from 'preact/hooks';

import { formatDate, progressLabel } from '../../format/format';

export function EpisodeItem({
  episode,
  focused,
}: {
  episode: Playable;
  focused: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) element.current?.scrollIntoView({ block: 'nearest' });
  }, [focused]);
  const image = episode.artwork.landscape;
  const progress = episode.progress;
  // Some sites put the air date in the title already.
  const date =
    episode.airDate && !episode.title.includes(episode.airDate.slice(0, 4))
      ? formatDate(episode.airDate)
      : undefined;
  const meta = [date, progressLabel(progress)].filter(Boolean).join(' · ');
  return (
    <div ref={element} class={focused ? 'episode focused' : 'episode'}>
      <div class='episode-image'>
        {image && (
          <img src={image.url} alt='' loading='lazy' decoding='async' />
        )}
        {progress && !progress.completed && progress.fraction > 0 && (
          <div class='episode-progress'>
            <div style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
        )}
      </div>
      <div>
        <div class='episode-title'>{episode.title}</div>
        {meta && <div class='episode-meta'>{meta}</div>}
      </div>
    </div>
  );
}
