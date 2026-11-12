import type { Library } from '@kiosk-tv/shared';
import { useState } from 'preact/hooks';

import { adminApi } from '../api/api.client';

/** Paste a link to a show, channel or playlist to add it to My shows. */
export function AddFromLink({
  onAdded,
}: {
  onAdded: (library: Library) => void;
}) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    { text: string; error: boolean } | undefined
  >();

  return (
    <>
      <form
        class='row-form'
        onSubmit={(event) => {
          event.preventDefault();
          const url = link.trim();
          if (!url || busy) return;
          setBusy(true);
          setMessage(undefined);
          adminApi
            .followLink(url)
            .then(
              ({ title, library }) => {
                onAdded(library);
                setLink('');
                setMessage({ text: `Added ${title.name}`, error: false });
              },
              (error: unknown) =>
                setMessage({
                  text: error instanceof Error ? error.message : String(error),
                  error: true,
                }),
            )
            .finally(() => setBusy(false));
        }}
      >
        <input
          class='grow'
          type='url'
          inputMode='url'
          value={link}
          placeholder='Paste a link to a show, channel or playlist'
          onInput={(e) => setLink(e.currentTarget.value)}
        />
        <button class='primary' type='submit' disabled={busy}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </form>
      {message && (
        <p class={message.error ? 'error' : 'muted'}>{message.text}</p>
      )}
    </>
  );
}
