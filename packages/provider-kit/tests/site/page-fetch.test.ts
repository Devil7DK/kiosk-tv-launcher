import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  fetchJson,
  SiteRequestError,
  SiteResponseError,
} from '../../src/index.js';

function pageAnswering(status: number, text: string): Page {
  return { evaluate: async () => ({ status, text }) } as unknown as Page;
}

const url = 'https://pwaapi.sunnxt.com/content/v3/contentDetail/198692/';
const schema = z.object({ results: z.array(z.object({ _id: z.string() })) });

describe('fetchJson', () => {
  it('returns the parsed body', async () => {
    const page = pageAnswering(200, '{"results":[{"_id":"198692"}]}');
    await expect(fetchJson(page, url, schema)).resolves.toEqual({
      results: [{ _id: '198692' }],
    });
  });

  it('reports the status of a failed request without its body', async () => {
    const page = pageAnswering(401, '{"message":"secret session detail"}');
    const error = await fetchJson(page, url, schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SiteRequestError);
    expect(String(error)).not.toContain('secret');
  });

  it('says where the shape differs instead of returning half an object', async () => {
    const page = pageAnswering(200, '{"results":[{"id":1}]}');
    const error = await fetchJson(page, url, schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SiteResponseError);
    expect(String(error)).toContain('results.0._id');
  });
});
