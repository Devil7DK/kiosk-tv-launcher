import type { PlaybackSession } from '@kiosk-tv/provider-kit';
import {
  newerProgress,
  type Playable,
  type PlaybackCommand,
  type PlaybackState,
  type PlayRequest,
  type Progress,
  type RemoteKey,
} from '@kiosk-tv/shared';

import type { CatalogService } from '../catalog/catalog.service.js';
import type { EventHub } from '../events/event.hub.js';
import type { Logger } from '../logging/logger.js';
import type { ProviderRegistry } from '../providers/provider.registry.js';
import type { WatchStore } from '../watch/watch.store.js';

export class PlaybackRequestError extends Error {
  override readonly name = 'PlaybackRequestError';
}

/** What the playback service needs from the TV's screen. */
export interface Screen {
  showPlayer(): Promise<void>;
  showLauncher(): Promise<void>;
}

type Finish = Extract<PlaybackState, { state: 'finished' }>['reason'];

const SKIP_SECONDS = 10;

/** One video at a time: starts it, records progress, and takes the screen back after. */
export class PlaybackService {
  private current: PlaybackState = { state: 'idle' };
  private session: PlaybackSession | undefined;
  private lastProgress: Progress | undefined;
  /** Bumped on every play, so a slow start that was replaced does not take over. */
  private generation = 0;

  constructor(
    private readonly deps: {
      registry: ProviderRegistry;
      catalog: CatalogService;
      watch: WatchStore;
      screen: Screen;
      events: EventHub;
      log: Logger;
    },
  ) {}

  get state(): PlaybackState {
    return this.current;
  }

  private set(state: PlaybackState): void {
    this.current = state;
    this.deps.events.publish({ type: 'playback', playback: state });
  }

  private async resumePoint(playable: Playable): Promise<number | undefined> {
    const recorded = (await this.deps.watch.get(playable.ref))?.progress;
    const progress = newerProgress(recorded, playable.progress);
    if (!progress || progress.completed) return undefined;
    if (progress.positionSeconds !== undefined) return progress.positionSeconds;
    if (progress.durationSeconds !== undefined) {
      return progress.fraction * progress.durationSeconds;
    }
    return undefined;
  }

  async play(request: PlayRequest): Promise<void> {
    const { playable } = request;
    const provider = this.deps.registry.get(playable.ref.provider);
    if (!provider) {
      throw new PlaybackRequestError(
        `${playable.ref.provider} is not available`,
      );
    }
    if (!this.deps.registry.owns(playable.ref.provider, playable.url)) {
      throw new PlaybackRequestError(
        'The watch URL is not on the provider’s site',
      );
    }

    const generation = ++this.generation;
    await this.release();
    this.lastProgress = undefined;
    this.set({ state: 'starting', playable });
    await this.deps.screen.showPlayer();

    const resumeAt = request.fromStart
      ? undefined
      : await this.resumePoint(playable);
    let session: PlaybackSession;
    try {
      session = await provider.play(
        playable,
        resumeAt === undefined ? {} : { resumeAt },
      );
    } catch (error) {
      if (generation !== this.generation) return;
      this.deps.log.error('playback did not start', {
        provider: playable.ref.provider,
        id: playable.ref.id,
        error: String(error),
      });
      this.set({ state: 'finished', playable, reason: 'failed' });
      await this.deps.screen.showLauncher();
      return;
    }
    if (generation !== this.generation) {
      await session.stop();
      return;
    }

    this.session = session;
    this.set({ state: 'playing', playable, paused: false });
    session.on('progress', (progress) => {
      this.lastProgress = progress;
      void this.deps.watch.record(playable, progress).catch((error: unknown) =>
        this.deps.log.error('could not record progress', {
          error: String(error),
        }),
      );
      if (this.current.state === 'playing' && this.session === session) {
        this.set({ ...this.current, progress });
      }
    });
    session.on('ended', () => void this.finish(session, 'ended'));
    session.on('left', () => void this.finish(session, 'left'));
    session.on('error', (error) =>
      this.deps.log.warn('playback reported an error', {
        error: String(error),
      }),
    );
  }

  private async release(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    await session?.stop().catch(() => {});
  }

  private async finish(
    session: PlaybackSession,
    reason: Finish,
  ): Promise<void> {
    if (this.session !== session) return;
    await this.release();
    const playable = session.playable;
    const next =
      reason === 'ended' || this.lastProgress?.completed
        ? await this.deps.catalog.nextOf(playable)
        : undefined;
    this.deps.catalog.forgetEpisodes();
    this.set({
      state: 'finished',
      playable,
      reason,
      ...(next ? { next } : {}),
    });
    this.deps.events.publish({ type: 'home' });
    await this.deps.screen.showLauncher();
  }

  async command(command: PlaybackCommand): Promise<void> {
    const session = this.session;
    if (!session || this.current.state !== 'playing') {
      throw new PlaybackRequestError('Nothing is playing');
    }
    switch (command.action) {
      case 'pause':
        await session.pause();
        this.set({ ...this.current, paused: true });
        return;
      case 'resume':
        await session.resume();
        this.set({ ...this.current, paused: false });
        return;
      case 'skip': {
        const at = (this.lastProgress?.positionSeconds ?? 0) + command.seconds;
        await session.seek(Math.max(0, at));
        return;
      }
      case 'stop':
        await this.finish(session, 'stopped');
        return;
    }
  }

  /** A key pressed while the player tab is in front. */
  async key(key: RemoteKey | 'fullscreenExit'): Promise<void> {
    if (this.current.state === 'starting' && key === 'back') {
      this.generation++;
      const playable = this.current.playable;
      await this.release();
      this.set({ state: 'finished', playable, reason: 'stopped' });
      await this.deps.screen.showLauncher();
      return;
    }
    if (this.current.state !== 'playing') return;
    switch (key) {
      case 'back':
      case 'fullscreenExit':
        return this.command({ action: 'stop' });
      case 'ok':
        return this.command({
          action: this.current.paused ? 'resume' : 'pause',
        });
      case 'left':
        return this.command({ action: 'skip', seconds: -SKIP_SECONDS });
      case 'right':
        return this.command({ action: 'skip', seconds: SKIP_SECONDS });
      default:
        return;
    }
  }
}
