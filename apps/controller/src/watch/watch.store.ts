import {
  newerProgress,
  type Playable,
  PlayableSchema,
  type Progress,
  ProgressSchema,
  type Ref,
  refKey,
} from '@kiosk-tv/shared';
import { z } from 'zod';

import type { Logger } from '../logging/logger.js';
import { JsonFile } from '../storage/json-file.js';

const WatchedSchema = z.object({
  playable: PlayableSchema,
  progress: ProgressSchema,
});
export type Watched = z.infer<typeof WatchedSchema>;

const WatchLogSchema = z.record(z.string(), WatchedSchema);

/** Oldest records beyond this are dropped; Continue watching never shows that many. */
const KEEP = 500;

function updatedAt(watched: Watched): number {
  return Date.parse(watched.progress.updatedAt ?? '') || 0;
}

/** What the viewer played from the launcher, and how far they got. */
export class WatchStore {
  private readonly file: JsonFile<typeof WatchLogSchema>;

  constructor(path: string, log: Logger) {
    this.file = new JsonFile(path, WatchLogSchema, () => ({}), log);
  }

  async record(playable: Playable, progress: Progress): Promise<void> {
    const { progress: _old, ...rest } = playable;
    await this.file.update((log) => {
      const key = refKey(playable.ref);
      const kept = newerProgress(log[key]?.progress, progress) ?? progress;
      const next = { ...log, [key]: { playable: rest, progress: kept } };
      const entries = Object.entries(next);
      if (entries.length <= KEEP) return next;
      entries.sort(([, a], [, b]) => updatedAt(b) - updatedAt(a));
      return Object.fromEntries(entries.slice(0, KEEP));
    });
  }

  async get(ref: Ref): Promise<Watched | undefined> {
    return (await this.file.read())[refKey(ref)];
  }

  /** Most recently watched first. */
  async recent(): Promise<Watched[]> {
    return Object.values(await this.file.read()).sort(
      (a, b) => updatedAt(b) - updatedAt(a),
    );
  }

  /** The latest record of any episode of the show. */
  async lastOfShow(show: Ref): Promise<Watched | undefined> {
    const key = refKey(show);
    return (await this.recent()).find(
      (w) => w.playable.parent && refKey(w.playable.parent.ref) === key,
    );
  }
}
