import './Row.css';

import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export function Row({
  title,
  focused,
  children,
}: {
  title: string;
  focused: boolean;
  children: ComponentChildren;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focused) element.current?.scrollIntoView({ block: 'center' });
  }, [focused]);
  return (
    <section ref={element} class={focused ? 'row focused' : 'row'}>
      <h2 class='row-title'>{title}</h2>
      <div class='row-items'>{children}</div>
    </section>
  );
}
