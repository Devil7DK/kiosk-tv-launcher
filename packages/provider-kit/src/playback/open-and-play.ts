import type { Playable } from '@kiosk-tv/shared';
import type { Frame, Page } from 'playwright-core';

import type { ProviderLogger } from '../provider/provider.js';
import type { PlaybackEvents, PlaybackSession } from './playback.js';
import { PlaybackMonitor, type VideoSample } from './playback.monitor.js';

/** How one site's player differs from the others. */
export interface PlayerProfile {
  /** Switches the site to the configured viewer profile; runs before the URL opens. */
  ensureProfile?(page: Page): Promise<void>;
  /**
   * Which `<video>` is the programme. `longest` skips the idle ad players some
   * sites keep next to it.
   */
  video?: 'first' | 'longest';
  fullscreen:
    | { key: string }
    | { dblclick: 'video' }
    | { click: string; thenKey?: string };
  /** Overlays to click away while the video starts: profile pickers, banners. */
  dismiss?: string[];
  /** Whether reopening a watch URL resumes by itself. */
  resumes: boolean;
  /**
   * Whether `url` still shows the video that was opened. Defaults to comparing
   * the path, which is wrong for sites that keep the id in the query.
   */
  isSameVideo?(opened: URL, current: URL): boolean;
}

export interface OpenAndPlayOptions {
  playable: Playable;
  profile: PlayerProfile;
  log: ProviderLogger;
  resumeAt?: number;
  /** Defaults to `playable.url`. */
  url?: string;
  startTimeoutMs?: number;
}

const MARK = 'data-kiosk-tv-video';
/** Reopened more than this far from the recorded position, the player is moved there. */
const RESUME_TOLERANCE_SECONDS = 60;

async function findVideo(
  page: Page,
  strategy: 'first' | 'longest',
): Promise<boolean> {
  return page.evaluate(
    ({ strategy, mark }) => {
      const videos = [...document.querySelectorAll('video')].filter(
        (v) => Number.isFinite(v.duration) && v.duration > 0,
      );
      if (videos.length === 0) return false;
      const chosen =
        strategy === 'first'
          ? videos[0]!
          : videos.reduce((a, b) => (b.duration > a.duration ? b : a));
      for (const v of document.querySelectorAll(`video[${mark}]`)) {
        v.removeAttribute(mark);
      }
      chosen.setAttribute(mark, '');
      return true;
    },
    { strategy, mark: MARK },
  );
}

async function sampleVideo(page: Page): Promise<VideoSample | undefined> {
  return page.evaluate((mark) => {
    const v = document.querySelector<HTMLVideoElement>(`video[${mark}]`);
    if (!v) return undefined;
    return { position: v.currentTime, duration: v.duration, ended: v.ended };
  }, MARK);
}

function onVideo(page: Page, action: 'pause' | 'play' | 'seek', at = 0) {
  return page.evaluate(
    async ({ mark, action, at }) => {
      const v = document.querySelector<HTMLVideoElement>(`video[${mark}]`);
      if (!v) return;
      if (action === 'pause') v.pause();
      else if (action === 'play') await v.play();
      else v.currentTime = at;
    },
    { mark: MARK, action, at },
  );
}

async function dismissOverlays(page: Page, selectors: string[]): Promise<void> {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible().catch(() => false)) {
      await target.click({ timeout: 2000 }).catch(() => {});
    }
  }
}

/**
 * The video fills the screen. Something being full screen is not enough:
 * YouTube makes the whole page full screen, and its player can fall back to
 * its normal size while the page stays full screen.
 */
async function isFullscreen(page: Page): Promise<boolean> {
  return page.evaluate((mark) => {
    const video = document.querySelector(`video[${mark}]`);
    if (!document.fullscreenElement || !video) return false;
    const { width, height } = video.getBoundingClientRect();
    return width >= innerWidth * 0.9 || height >= innerHeight * 0.9;
  }, MARK);
}

async function goFullscreen(page: Page, profile: PlayerProfile): Promise<void> {
  const how = profile.fullscreen;
  const video = page.locator(`video[${MARK}]`);
  // A page left full screen ignores the player's request to go full screen, so
  // the player never grows. Safe only while starting: leaving full screen
  // during playback stops it.
  const stuck = await page.evaluate(() => document.fullscreenElement !== null);
  if (stuck) {
    await page.evaluate(() => document.exitFullscreen());
    await delay(600);
  }
  if ('key' in how) {
    await page.keyboard.press(how.key);
  } else if ('dblclick' in how) {
    await video.dblclick({ force: true });
  } else {
    await video.hover({ force: true }).catch(() => {});
    await page.locator(how.click).first().click({ force: true });
    if (how.thenKey) await page.keyboard.press(how.thenKey);
  }
}

function defaultSameVideo(opened: URL, current: URL): boolean {
  return (
    opened.origin === current.origin && opened.pathname === current.pathname
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The position must move first: players restore their own start point once playing. */
async function waitUntilPlaying(
  page: Page,
  timeoutMs: number,
): Promise<VideoSample | undefined> {
  const deadline = Date.now() + timeoutMs;
  let previous = await sampleVideo(page).catch(() => undefined);
  while (Date.now() < deadline) {
    await delay(500);
    const sample = await sampleVideo(page).catch(() => undefined);
    if (sample && previous && sample.position > previous.position)
      return sample;
    previous = sample;
  }
  return undefined;
}

async function resume(
  page: Page,
  playing: VideoSample,
  resumeAt: number,
  siteResumes: boolean,
  log: ProviderLogger,
): Promise<void> {
  if (resumeAt >= playing.duration - 30) return;
  const off = () => Math.abs(playing.position - resumeAt);
  if (siteResumes && off() <= RESUME_TOLERANCE_SECONDS) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    await onVideo(page, 'seek', resumeAt);
    await delay(1500);
    const now = await sampleVideo(page).catch(() => undefined);
    if (now && Math.abs(now.position - resumeAt) < 10) return;
  }
  log.warn('could not move the video to the resume position', { resumeAt });
}

/**
 * Opens a watch page in the player tab and drives it the same way for every
 * site: profile, start, resume, full screen, then progress until the video
 * ends or the site wanders off to something the viewer did not choose.
 */
export async function openAndPlay(
  page: Page,
  options: OpenAndPlayOptions,
): Promise<PlaybackSession> {
  const { playable, profile, log } = options;
  const url = options.url ?? playable.url;
  const timeout = options.startTimeoutMs ?? 45_000;

  await profile.ensureProfile?.(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const deadline = Date.now() + timeout;
  while (
    !(await findVideo(page, profile.video ?? 'longest').catch(() => false))
  ) {
    if (Date.now() > deadline) {
      throw new Error(`No video started on ${new URL(url).pathname}`);
    }
    await dismissOverlays(page, profile.dismiss ?? []);
    await delay(500);
  }

  // Remembered after the site's own redirects, which happen before the video appears.
  const opened = new URL(page.url());
  const sameVideo = profile.isSameVideo ?? defaultSameVideo;

  await onVideo(page, 'play').catch(() => {});
  const playing = await waitUntilPlaying(page, 15_000);
  if (options.resumeAt !== undefined && playing) {
    await resume(page, playing, options.resumeAt, profile.resumes, log);
  }

  for (let attempt = 0; attempt < 3 && !(await isFullscreen(page)); attempt++) {
    await goFullscreen(page, profile).catch((error: unknown) =>
      log.warn('full screen attempt failed', { error: String(error) }),
    );
    await delay(700);
  }
  if (!(await isFullscreen(page))) log.warn('video is not full screen');

  const listeners: { [E in keyof PlaybackEvents]: Set<PlaybackEvents[E]> } = {
    progress: new Set(),
    ended: new Set(),
    left: new Set(),
    error: new Set(),
  };

  const monitor = new PlaybackMonitor((event) => {
    if (event.progress) {
      for (const fn of listeners.progress) fn(event.progress);
    }
    if (event.type === 'ended') for (const fn of listeners.ended) fn();
    if (event.type === 'left') for (const fn of listeners.left) fn(event.url);
    if (event.type !== 'progress') release();
  });

  const onNavigated = (frame: Frame) => {
    if (frame !== page.mainFrame()) return;
    const current = new URL(frame.url());
    if (!sameVideo(opened, current)) monitor.navigated(frame.url(), Date.now());
  };
  page.on('framenavigated', onNavigated);

  let polling = true;
  const poll = async () => {
    while (polling) {
      const sample = await sampleVideo(page).catch(() => undefined);
      if (sample) monitor.sample(sample, Date.now());
      await delay(1000);
    }
  };
  void poll().catch((error: unknown) => {
    for (const fn of listeners.error) {
      fn(error instanceof Error ? error : new Error(String(error)));
    }
  });

  function release() {
    polling = false;
    page.off('framenavigated', onNavigated);
  }

  return {
    playable,
    on(event, listener) {
      const set = listeners[event] as Set<typeof listener>;
      set.add(listener);
      return () => set.delete(listener);
    },
    pause: () => onVideo(page, 'pause'),
    resume: () => onVideo(page, 'play'),
    seek: (seconds) => onVideo(page, 'seek', seconds),
    async stop() {
      const progress = monitor.stop(Date.now());
      release();
      if (progress) for (const fn of listeners.progress) fn(progress);
      await onVideo(page, 'pause').catch(() => {});
      await page
        .evaluate(() =>
          document.fullscreenElement ? document.exitFullscreen() : undefined,
        )
        .catch(() => {});
    },
  };
}
