import './Message.css';

import type { ComponentChildren } from 'preact';

export function Message({
  title,
  children,
}: {
  title: string;
  children?: ComponentChildren;
}) {
  return (
    <div class='message'>
      <p class='message-title'>{title}</p>
      {children && <div class='message-detail'>{children}</div>}
    </div>
  );
}
