import type { CameraFrame } from "@mara/shared";

export interface FrameBusSubscriber {
  id: string;
  minIntervalMs: number;
  lastSentMs: number;
  busy: boolean;
  onFrame: (frame: CameraFrame) => void | Promise<void>;
}

export interface FrameBusStats {
  published: number;
  delivered: number;
  droppedBusy: number;
  droppedInterval: number;
}

export type CreateImageBitmapFn = (
  image: ImageBitmapSource,
  options?: ImageBitmapOptions,
) => Promise<ImageBitmap>;

export interface FrameBusDeps {
  createImageBitmap?: CreateImageBitmapFn;
  now?: () => number;
}

export class FrameBus {
  private readonly subscribers = new Map<string, FrameBusSubscriber>();
  private readonly changeListeners = new Set<() => void>();
  private readonly createImageBitmapFn: CreateImageBitmapFn;
  private readonly now: () => number;
  private readonly stats: FrameBusStats = {
    published: 0,
    delivered: 0,
    droppedBusy: 0,
    droppedInterval: 0,
  };

  constructor(deps: FrameBusDeps = {}) {
    this.createImageBitmapFn =
      deps.createImageBitmap ??
      ((image, options) =>
        options ? createImageBitmap(image, options) : createImageBitmap(image));
    this.now = deps.now ?? (() => performance.now());
  }

  subscribe(
    consumerId: string,
    fps: number,
    onFrame: (frame: CameraFrame) => void | Promise<void>,
  ): () => void {
    const minIntervalMs = fps > 0 ? 1000 / fps : Number.POSITIVE_INFINITY;
    const existed = this.subscribers.has(consumerId);
    this.subscribers.set(consumerId, {
      id: consumerId,
      minIntervalMs,
      lastSentMs: Number.NEGATIVE_INFINITY,
      busy: false,
      onFrame,
    });
    if (!existed) {
      this.emitChange();
    }
    return () => {
      this.subscribers.delete(consumerId);
      this.emitChange();
    };
  }

  hasSubscribers(): boolean {
    return this.subscribers.size > 0;
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  onSubscribersChanged(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  getStats(): FrameBusStats {
    return { ...this.stats };
  }

  setSubscriberFps(consumerId: string, fps: number): void {
    const subscriber = this.subscribers.get(consumerId);
    if (!subscriber) {
      return;
    }
    subscriber.minIntervalMs = fps > 0 ? 1000 / fps : Number.POSITIVE_INFINITY;
  }

  /**
   * Clones the source bitmap for eligible subscribers, then returns.
   * Consumer work is latest-frame-wins (queue depth 1): a busy subscriber
   * drops the next frame. The caller must close `frame.bitmap` after this
   * promise resolves unless a single subscriber received the original
   * (transferred) bitmap — see the returned flag.
   */
  async publish(frame: CameraFrame): Promise<{ transferredSource: boolean }> {
    this.stats.published += 1;
    const now = this.now();
    const eligible: FrameBusSubscriber[] = [];

    for (const subscriber of this.subscribers.values()) {
      if (now - subscriber.lastSentMs < subscriber.minIntervalMs) {
        this.stats.droppedInterval += 1;
        continue;
      }
      if (subscriber.busy) {
        this.stats.droppedBusy += 1;
        continue;
      }
      eligible.push(subscriber);
    }

    if (eligible.length === 0) {
      return { transferredSource: false };
    }

    if (eligible.length === 1) {
      this.deliver(eligible[0], frame, now);
      return { transferredSource: true };
    }

    const copies = await Promise.all(
      eligible.map(async (subscriber) => {
        const bitmap = await this.createImageBitmapFn(frame.bitmap);
        return { subscriber, bitmap };
      }),
    );

    for (const { subscriber, bitmap } of copies) {
      this.deliver(
        subscriber,
        {
          frameId: frame.frameId,
          timestampMs: frame.timestampMs,
          width: frame.width,
          height: frame.height,
          bitmap,
        },
        now,
      );
    }
    return { transferredSource: false };
  }

  clear(): void {
    this.subscribers.clear();
    this.emitChange();
  }

  private deliver(
    subscriber: FrameBusSubscriber,
    next: CameraFrame,
    now: number,
  ): void {
    subscriber.busy = true;
    subscriber.lastSentMs = now;
    this.stats.delivered += 1;
    const bitmap = next.bitmap;
    void Promise.resolve(subscriber.onFrame(next))
      .catch(() => {
        /* consumer errors must not stall capture */
      })
      .finally(() => {
        try {
          bitmap.close();
        } catch {
          /* already transferred or closed */
        }
        subscriber.busy = false;
      });
  }

  private emitChange(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }
}
