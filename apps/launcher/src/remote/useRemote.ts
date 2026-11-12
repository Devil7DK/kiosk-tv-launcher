import { type RemoteKey, remoteKeyFor } from '@kiosk-tv/shared';
import { useEffect, useRef } from 'preact/hooks';

/** Calls `handler` for remote buttons while `active`; the screen below a dialog stays quiet. */
export function useRemote(
  handler: (key: RemoteKey) => void,
  active = true,
): void {
  const current = useRef(handler);
  current.current = handler;

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const key = remoteKeyFor(event.key);
      if (!key) return;
      event.preventDefault();
      current.current(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
