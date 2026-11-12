import type { ServerEvent } from '@kiosk-tv/shared';

export class EventHub {
  private readonly subscribers = new Set<(event: ServerEvent) => void>();

  subscribe(subscriber: (event: ServerEvent) => void): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  publish(event: ServerEvent): void {
    for (const subscriber of this.subscribers) subscriber(event);
  }
}
