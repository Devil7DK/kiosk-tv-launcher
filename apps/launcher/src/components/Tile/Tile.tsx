import './Tile.css';

import type { Artwork, Progress } from '@kiosk-tv/shared';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface TileProps {
  title: string;
  subtitle?: string | undefined;
  artwork: Artwork;
  focused: boolean;
  progress?: Progress | undefined;
  badge?: string | undefined;
}

export function Tile({
  title,
  subtitle,
  artwork,
  focused,
  progress,
  badge,
}: TileProps) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused)
      element.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focused]);

  const image = artwork.landscape ?? artwork.backdrop;
  const [failed, setFailed] = useState(false);
  return (
    <div ref={element} class={focused ? 'tile focused' : 'tile'}>
      <div class='tile-image'>
        {image && !failed ? (
          <img
            src={image.url}
            alt=''
            loading='lazy'
            decoding='async'
            onError={() => setFailed(true)}
          />
        ) : (
          <div class='tile-fallback'>{title}</div>
        )}
        {badge && <span class='tile-badge'>{badge}</span>}
        {progress && !progress.completed && progress.fraction > 0 && (
          <div class='tile-progress'>
            <div style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
        )}
      </div>
      <div class='tile-title'>{title}</div>
      {subtitle && <div class='tile-subtitle'>{subtitle}</div>}
    </div>
  );
}
