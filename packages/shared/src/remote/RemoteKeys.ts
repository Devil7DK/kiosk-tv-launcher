import type { RemoteKey } from '../api/ApiSchemas.js';

/**
 * Keyboard keys a remote may send for each button. Remotes that pose as a
 * keyboard differ in what they send for Back, so several keys mean the same.
 */
const KEYS: Record<string, RemoteKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'ok',
  ' ': 'ok',
  Escape: 'back',
  Backspace: 'back',
  BrowserBack: 'back',
  GoBack: 'back',
};

export const REMOTE_KEYBOARD_KEYS = Object.keys(KEYS);

export function remoteKeyFor(keyboardKey: string): RemoteKey | undefined {
  return KEYS[keyboardKey];
}
