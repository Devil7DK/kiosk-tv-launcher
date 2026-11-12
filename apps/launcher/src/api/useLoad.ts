import { useEffect, useState } from 'preact/hooks';

export type Loaded<T> =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; value: T };

/** Loads once per `key`, and again whenever `key` changes. */
export function useLoad<T>(load: () => Promise<T>, key: unknown): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: 'loading' });
  useEffect(() => {
    let current = true;
    setLoaded((previous) =>
      previous.state === 'ready' ? previous : { state: 'loading' },
    );
    load().then(
      (value) => current && setLoaded({ state: 'ready', value }),
      (error: unknown) =>
        current &&
        setLoaded({
          state: 'failed',
          message: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      current = false;
    };
  }, [key]);
  return loaded;
}
