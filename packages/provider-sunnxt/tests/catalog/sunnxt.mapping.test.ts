import { describe, expect, it } from 'vitest';

import { ContentSchema } from '../../src/api/sunnxt.schemas.js';
import {
  inLanguages,
  parseContents,
  toCatalogItem,
  toPlayable,
  toTitle,
} from '../../src/catalog/sunnxt.mapping.js';
import { fixture, quietLog } from '../fake-site.js';

function contents(name: string) {
  return parseContents(
    (fixture(name) as { results: unknown[] }).results,
    quietLog,
    name,
  );
}

describe('Sun NXT mapping', () => {
  it('turns a vodchannel into a series with TV-sized artwork', () => {
    const [show] = contents('content-detail-show');
    const title = toTitle(show!);
    expect(title).toMatchObject({
      ref: { provider: 'sunnxt', id: '198692' },
      kind: 'series',
      name: 'Moondru Mudichu',
      languages: ['ta'],
      url: 'https://www.sunnxt.com/show/detail/198692/0',
    });
    expect(title?.artwork.landscape?.width).toBe(640);
    expect(title?.artwork.backdrop?.width).toBe(1920);
  });

  it('names an episode by its number and date and links it to its show', () => {
    const [latest] = contents('vods-month');
    expect(toPlayable(latest!)).toMatchObject({
      kind: 'episode',
      title: 'E688 - Nov 11, 2026',
      number: 688,
      airDate: '2026-11-11',
      parent: {
        ref: { provider: 'sunnxt', id: '198692' },
        name: 'Moondru Mudichu',
      },
      url: 'https://www.sunnxt.com/player/282534',
    });
  });

  it('keeps the air date the site shows, not the UTC day after', () => {
    const [latest] = contents('vods-month');
    expect(latest!.content?.releaseDate).toMatch(/^2026-11-11T/);
    expect(toPlayable(latest!)?.airDate).toBe('2026-11-11');
  });

  it('leaves live channels off a shelf, since there is nothing to resume or follow', () => {
    const items = contents('carousel-mixed').map(toCatalogItem);
    expect(items.map((i) => i && ('name' in i ? i.name : i.title))).toEqual([
      'Sun Singer 2026',
      'Bhairavi',
      undefined,
      'The Grandmaster',
    ]);
  });

  it('skips an entry of an unexpected shape and keeps the rest', () => {
    const warnings: unknown[] = [];
    const parsed = parseContents(
      [
        { nonsense: true },
        ...(fixture('vods-month') as { results: unknown[] }).results,
      ],
      { ...quietLog, warn: (...args) => warnings.push(args) },
      'test',
    );
    expect(parsed).toHaveLength(3);
    expect(warnings).toHaveLength(1);
  });

  it('filters by language but keeps items that name none', () => {
    const [show] = contents('content-detail-show');
    const title = toTitle(show!)!;
    expect(inLanguages(title, ['ta'])).toBe(true);
    expect(inLanguages(title, ['te'])).toBe(false);
    const { languages: _languages, ...unnamed } = title;
    expect(inLanguages(unnamed, ['te'])).toBe(true);
  });

  it('parses the schema the fixtures were trimmed to', () => {
    expect(
      ContentSchema.safeParse(
        (fixture('favorites') as { results: unknown[] }).results[0],
      ).success,
    ).toBe(true);
  });
});
