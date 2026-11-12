import type { Progress } from '@kiosk-tv/shared';

const DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** `2026-11-11` as `11 Nov 2026`, read as a calendar date with no time zone shift. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return DATE.format(new Date(year, month - 1, day));
}

export function progressLabel(
  progress: Progress | undefined,
): string | undefined {
  if (!progress) return undefined;
  if (progress.completed) return 'Watched';
  if (
    progress.positionSeconds === undefined ||
    progress.durationSeconds === undefined
  ) {
    return progress.fraction > 0 ? 'Started' : undefined;
  }
  const left = Math.max(
    0,
    Math.round((progress.durationSeconds - progress.positionSeconds) / 60),
  );
  return left <= 1 ? 'Almost done' : `${left} min left`;
}

/** The air date to show, unless the site already put it in the title. */
export function airDateLabel(playable: {
  title: string;
  airDate?: string | undefined;
}): string | undefined {
  if (
    !playable.airDate ||
    playable.title.includes(playable.airDate.slice(0, 4))
  ) {
    return undefined;
  }
  return formatDate(playable.airDate);
}
