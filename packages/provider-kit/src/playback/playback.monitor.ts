import { type Progress, progressAt } from '@kiosk-tv/shared';

export interface VideoSample {
  position: number;
  duration: number;
  ended: boolean;
}

export interface MonitorOptions {
  progressEverySeconds?: number;
  /**
   * A site leaving the page this close to the end counts as the end. Sun NXT
   * navigates in the same tick as `ended`, so the event itself is never seen.
   */
  endSlackSeconds?: number;
}

export type MonitorEvent =
  | { type: 'progress'; progress: Progress }
  | { type: 'ended'; progress?: Progress }
  | { type: 'left'; url: string; progress?: Progress };

/** Turns samples of the playing video into progress and a single end event. */
export class PlaybackMonitor {
  private last: VideoSample | undefined;
  private lastReportAt = -Infinity;
  private finished = false;
  private readonly progressEvery: number;
  private readonly endSlack: number;

  constructor(
    private readonly emit: (event: MonitorEvent) => void,
    options: MonitorOptions = {},
  ) {
    this.progressEvery = (options.progressEverySeconds ?? 10) * 1000;
    this.endSlack = options.endSlackSeconds ?? 15;
  }

  get done(): boolean {
    return this.finished;
  }

  sample(sample: VideoSample, now: number): void {
    if (this.finished) return;
    if (!Number.isFinite(sample.duration) || sample.duration <= 0) return;
    this.last = sample;
    if (sample.ended || sample.position >= sample.duration - 0.5) {
      this.finish({ type: 'ended', progress: this.progress(now) });
      return;
    }
    if (now - this.lastReportAt >= this.progressEvery) {
      this.lastReportAt = now;
      this.emit({ type: 'progress', progress: this.progress(now)! });
    }
  }

  /** The page went somewhere the controller did not send it. */
  navigated(url: string, now: number): void {
    if (this.finished) return;
    const progress = this.progress(now);
    const nearEnd =
      this.last !== undefined &&
      this.last.position >= this.last.duration - this.endSlack;
    this.finish(
      nearEnd ? { type: 'ended', progress } : { type: 'left', url, progress },
    );
  }

  /** The controller stopped playback; reports where it stopped. */
  stop(now: number): Progress | undefined {
    if (this.finished) return undefined;
    this.finished = true;
    return this.progress(now);
  }

  private progress(now: number): Progress | undefined {
    if (!this.last) return undefined;
    return progressAt(
      this.last.position,
      this.last.duration,
      'launcher',
      new Date(now).toISOString(),
    );
  }

  private finish(event: MonitorEvent): void {
    this.finished = true;
    this.emit(event);
  }
}
