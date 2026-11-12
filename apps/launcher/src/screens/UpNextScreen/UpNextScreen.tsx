import './UpNextScreen.css';

import type { Playable } from '@kiosk-tv/shared';
import { useState } from 'preact/hooks';

import { Button } from '../../components/Button';
import { formatDate } from '../../format/format';
import type { Navigation } from '../../navigation/navigation';
import { useRemote } from '../../remote/useRemote';

/** Shown after an episode ends; waits for the viewer, never starts on its own. */
export function UpNextScreen({
  next,
  navigation,
  active,
  onShowEpisodes,
}: {
  next: Playable;
  navigation: Navigation;
  active: boolean;
  onShowEpisodes: () => void;
}) {
  const [focused, setFocused] = useState(0);
  useRemote((key) => {
    if (key === 'up') setFocused(0);
    else if (key === 'down') setFocused(1);
    else if (key === 'back') navigation.back();
    else if (key === 'ok') {
      if (focused === 0) navigation.play(next);
      else onShowEpisodes();
    }
  }, active);

  const image = next.artwork.landscape ?? next.artwork.backdrop;
  return (
    <div class='up-next'>
      <div class='up-next-image'>{image && <img src={image.url} alt='' />}</div>
      <div>
        <div class='up-next-label'>Next episode</div>
        {next.parent && <div class='up-next-show'>{next.parent.name}</div>}
        <h1 class='up-next-title'>{next.title}</h1>
        {next.airDate && (
          <div class='up-next-label'>{formatDate(next.airDate)}</div>
        )}
        <div class='up-next-buttons'>
          <Button label='Play' focused={active && focused === 0} />
          <Button label='All episodes' focused={active && focused === 1} />
        </div>
      </div>
    </div>
  );
}
