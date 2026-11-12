import type { RemoteStatus } from '@kiosk-tv/shared';
import { createContext } from 'preact';

/** What the TV knows about its own hardware, for screens that show it. */
export const RemoteStatusContext = createContext<RemoteStatus>({
  batteryLow: false,
});
