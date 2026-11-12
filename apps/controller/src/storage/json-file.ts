import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { z } from 'zod';

import type { Logger } from '../logging/logger.js';

/**
 * One JSON document on disk. Writes go to a temporary file renamed over the
 * old one, so a power cut leaves either the old or the new file, never half.
 */
export class JsonFile<Schema extends z.ZodType> {
  private value: z.infer<Schema> | undefined;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly schema: Schema,
    private readonly empty: () => z.infer<Schema>,
    private readonly log: Logger,
  ) {}

  async read(): Promise<z.infer<Schema>> {
    if (this.value !== undefined) return this.value;
    let text: string | undefined;
    try {
      text = await readFile(this.path, 'utf8');
    } catch {
      text = undefined;
    }
    if (text === undefined) {
      this.value = this.empty();
      return this.value;
    }
    const parsed = (() => {
      try {
        return this.schema.safeParse(JSON.parse(text));
      } catch {
        return undefined;
      }
    })();
    if (parsed?.success) {
      this.value = parsed.data;
    } else {
      const aside = `${this.path}.unreadable-${Date.now()}`;
      this.log.error('stored file is unreadable; starting empty', {
        path: this.path,
        keptAs: aside,
      });
      await rename(this.path, aside).catch(() => {});
      this.value = this.empty();
    }
    return this.value;
  }

  /** Applies `change` to the current value and saves it; changes run one at a time. */
  async update(
    change: (current: z.infer<Schema>) => z.infer<Schema>,
  ): Promise<z.infer<Schema>> {
    const result = this.writing.then(async () => {
      const next = this.schema.parse(
        change(await this.read()),
      ) as z.infer<Schema>;
      this.value = next;
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, JSON.stringify(next, null, 2) + '\n');
      await rename(temporary, this.path);
      return next;
    });
    this.writing = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
