import type { ProviderLogger } from '@kiosk-tv/provider-kit';

export type Logger = ProviderLogger & { child(scope: string): Logger };

/** One JSON line per entry, so `journalctl` output can be filtered with jq. */
export function createLogger(
  scope = 'controller',
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Logger {
  const log =
    (level: string) => (message: string, fields?: Record<string, unknown>) =>
      write(
        JSON.stringify({
          time: new Date().toISOString(),
          level,
          scope,
          message,
          ...fields,
        }),
      );
  return {
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (child) => createLogger(`${scope}:${child}`, write),
  };
}
