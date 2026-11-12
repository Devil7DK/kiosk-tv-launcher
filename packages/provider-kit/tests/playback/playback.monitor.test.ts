import { describe, expect, it } from 'vitest';

import { type MonitorEvent, PlaybackMonitor } from '../../src/index.js';

function monitor() {
  const events: MonitorEvent[] = [];
  return {
    events,
    monitor: new PlaybackMonitor((event) => events.push(event), {
      progressEverySeconds: 10,
      endSlackSeconds: 15,
    }),
  };
}

const at = (position: number, duration = 1200, ended = false) => ({
  position,
  duration,
  ended,
});

describe('PlaybackMonitor', () => {
  it('reports progress at most every ten seconds', () => {
    const { events, monitor: m } = monitor();
    for (let second = 0; second < 25; second++) {
      m.sample(at(100 + second), second * 1000);
    }
    expect(events.filter((e) => e.type === 'progress')).toHaveLength(3);
  });

  it('ignores samples before the video knows its length', () => {
    const { events, monitor: m } = monitor();
    m.sample(at(0, Number.NaN), 0);
    m.sample(at(0, 0), 1000);
    expect(events).toEqual([]);
  });

  it('ends once when the video reports ended', () => {
    const { events, monitor: m } = monitor();
    m.sample(at(1199.8, 1200, true), 0);
    m.sample(at(1200, 1200, true), 1000);
    expect(events.map((e) => e.type)).toEqual(['ended']);
  });

  it('treats a site navigating away in the last seconds as the end', () => {
    const { events, monitor: m } = monitor();
    m.sample(at(1190), 0);
    m.navigated('https://www.sunnxt.com/player/282535', 1000);
    expect(events.at(-1)).toMatchObject({ type: 'ended' });
  });

  it('reports a navigation mid-episode as leaving, with where it stopped', () => {
    const { events, monitor: m } = monitor();
    m.sample(at(300), 0);
    m.navigated('https://www.sunnxt.com/', 1000);
    expect(events.at(-1)).toMatchObject({
      type: 'left',
      progress: { positionSeconds: 300, source: 'launcher' },
    });
  });

  it('stays silent after the controller stops it', () => {
    const { events, monitor: m } = monitor();
    m.sample(at(300), 0);
    expect(m.stop(1000)?.positionSeconds).toBe(300);
    m.navigated('https://www.sunnxt.com/', 2000);
    expect(events.map((e) => e.type)).toEqual(['progress']);
  });
});
