import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { JsonFile } from '../../src/storage/json-file.js';
import { silentLog } from '../support/fakes.js';

const Counter = z.object({ count: z.number() });

async function file(name = 'counter.json') {
  const dir = await mkdtemp(join(tmpdir(), 'kiosk-tv-'));
  return { dir, path: join(dir, name) };
}

describe('JsonFile', () => {
  it('starts from the empty value when nothing is stored yet', async () => {
    const { path } = await file();
    const store = new JsonFile(path, Counter, () => ({ count: 0 }), silentLog);
    await expect(store.read()).resolves.toEqual({ count: 0 });
  });

  it('applies concurrent changes one after the other', async () => {
    const { path } = await file();
    const store = new JsonFile(path, Counter, () => ({ count: 0 }), silentLog);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        store.update((c) => ({ count: c.count + 1 })),
      ),
    );
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ count: 10 });
  });

  it('sets an unreadable file aside instead of failing to start', async () => {
    const { dir, path } = await file();
    await writeFile(path, '{"count": "many"');
    const store = new JsonFile(path, Counter, () => ({ count: 0 }), silentLog);
    await expect(store.read()).resolves.toEqual({ count: 0 });
    expect((await readdir(dir)).some((f) => f.includes('unreadable'))).toBe(
      true,
    );
  });

  it('refuses a change that breaks the schema and keeps the old value', async () => {
    const { path } = await file();
    const store = new JsonFile(path, Counter, () => ({ count: 1 }), silentLog);
    await expect(
      store.update(() => ({ count: 'two' }) as never),
    ).rejects.toThrow();
    await expect(store.read()).resolves.toEqual({ count: 1 });
  });
});
