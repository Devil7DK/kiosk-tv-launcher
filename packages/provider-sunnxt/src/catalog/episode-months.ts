import type { EpisodeGroup } from '@kiosk-tv/shared';

export interface Month {
  year: number;
  month: number;
}

const LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function monthId({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonth(
  value: string | null | undefined,
): Month | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})/);
  if (!match) return undefined;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return undefined;
  return { year: Number(match[1]), month };
}

export function previousMonth({ year, month }: Month): Month {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

export function isBefore(a: Month, b: Month): boolean {
  return a.year < b.year || (a.year === b.year && a.month < b.month);
}

/** Newest first, from `last` back to `first`; both included. */
export function monthGroups(first: Month, last: Month): EpisodeGroup[] {
  const groups: EpisodeGroup[] = [];
  for (let m = last; !isBefore(m, first); m = previousMonth(m)) {
    groups.push({ id: monthId(m), label: `${LABELS[m.month - 1]} ${m.year}` });
  }
  return groups;
}
