import type { Playable, Progress } from '@kiosk-tv/shared';

export interface PlayOptions {
  /** Seconds to start at, from the launcher's own record. */
  resumeAt?: number;
}

export interface PlaybackEvents {
  progress: (progress: Progress) => void;
  ended: () => void;
  /** The site navigated by itself, usually to autoplay something else. */
  left: (url: string) => void;
  error: (error: Error) => void;
}

/** One video playing in the player tab, until it ends or the controller stops it. */
export interface PlaybackSession {
  readonly playable: Playable;
  /** Returns a function that removes the listener. */
  on<Event extends keyof PlaybackEvents>(
    event: Event,
    listener: PlaybackEvents[Event],
  ): () => void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(seconds: number): Promise<void>;
  /** Pauses and lets go of the tab, so the controller can bring the launcher back. */
  stop(): Promise<void>;
}
