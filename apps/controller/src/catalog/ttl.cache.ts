/** Remembers answers for a while; a failed lookup is not remembered. */
export class TtlCache<Value> {
  private readonly entries = new Map<
    string,
    { at: number; value: Promise<Value> }
  >();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
    private readonly limit = 500,
  ) {}

  get(key: string, load: () => Promise<Value>): Promise<Value> {
    const hit = this.entries.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const value = load();
    this.entries.set(key, { at: this.now(), value });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    if (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}
