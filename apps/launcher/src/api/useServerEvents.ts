import { type ServerEvent, ServerEventSchema } from '@kiosk-tv/shared';
import { useEffect, useRef } from 'preact/hooks';

/** Live updates from the controller; the browser reconnects by itself after a restart. */
export function useServerEvents(onEvent: (event: ServerEvent) => void): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onmessage = (message: MessageEvent<string>) => {
      const parsed = ServerEventSchema.safeParse(JSON.parse(message.data));
      if (parsed.success) handler.current(parsed.data);
    };
    return () => source.close();
  }, []);
}
