import { z } from 'zod';

/** Watched this far, an item counts as finished and leaves Continue watching. */
export const COMPLETED_FRACTION = 0.95;

export const ProgressSchema = z.object({
  positionSeconds: z.number().nonnegative().optional(),
  durationSeconds: z.number().positive().optional(),
  /** From 0 to 1. YouTube reports only this, never seconds. */
  fraction: z.number().min(0).max(1),
  completed: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
  /** `launcher` when the controller recorded it while the video played. */
  source: z.enum(['provider', 'launcher']),
});
export type Progress = z.infer<typeof ProgressSchema>;

export function progressAt(
  positionSeconds: number,
  durationSeconds: number,
  source: Progress['source'],
  updatedAt?: string,
): Progress {
  const fraction =
    durationSeconds > 0
      ? Math.min(1, Math.max(0, positionSeconds / durationSeconds))
      : 0;
  return {
    positionSeconds,
    durationSeconds,
    fraction,
    completed: fraction >= COMPLETED_FRACTION,
    ...(updatedAt === undefined ? {} : { updatedAt }),
    source,
  };
}

/** The newer of two records wins; one without a time loses to one with a time. */
export function newerProgress(
  a: Progress | undefined,
  b: Progress | undefined,
): Progress | undefined {
  if (!a) return b;
  if (!b) return a;
  if (!b.updatedAt) return a;
  if (!a.updatedAt) return b;
  return Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
}
