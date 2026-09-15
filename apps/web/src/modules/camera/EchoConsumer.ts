import type { CameraService } from "./CameraService";
import type { EchoOut } from "./echo.worker";
import type { FrameEcho } from "./types";

export type EchoListener = (echo: FrameEcho) => void;

export interface EchoConsumerDeps {
  createWorker?: () => Worker;
}

export class EchoConsumer {
  private worker: Worker | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<EchoListener>();
  private readonly createWorker: () => Worker;
  private last: FrameEcho | null = null;
  private pending = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();

  constructor(deps: EchoConsumerDeps = {}) {
    this.createWorker =
      deps.createWorker ??
      (() =>
        new Worker(new URL("./echo.worker.ts", import.meta.url), {
          type: "module",
        }));
  }

  getLast(): FrameEcho | null {
    return this.last;
  }

  subscribe(listener: EchoListener): () => void {
    this.listeners.add(listener);
    if (this.last) {
      listener(this.last);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(camera: CameraService): void {
    this.stop();
    this.worker = this.createWorker();
    this.worker.addEventListener("message", this.onMessage);

    this.unsubscribe = camera.subscribe("echo", 8, (frame) => {
      const worker = this.worker;
      if (!worker) {
        try {
          frame.bitmap.close();
        } catch {
          /* ignore */
        }
        return;
      }

      return new Promise<void>((resolve, reject) => {
        this.pending.set(frame.frameId, { resolve, reject });
        worker.postMessage(
          {
            type: "frame",
            frameId: frame.frameId,
            timestampMs: frame.timestampMs,
            bitmap: frame.bitmap,
          },
          [frame.bitmap],
        );
      });
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const pending of this.pending.values()) {
      pending.resolve();
    }
    this.pending.clear();
    if (this.worker) {
      this.worker.removeEventListener("message", this.onMessage);
      this.worker.terminate();
      this.worker = null;
    }
    this.last = null;
  }

  private onMessage = (event: MessageEvent<EchoOut>): void => {
    const data = event.data;
    if (data.type === "echo") {
      const echo: FrameEcho = {
        frameId: data.frameId,
        timestampMs: data.timestampMs,
        meanLuma: data.meanLuma,
      };
      this.last = echo;
      this.pending.get(data.frameId)?.resolve();
      this.pending.delete(data.frameId);
      for (const listener of this.listeners) {
        listener(echo);
      }
      return;
    }
    if (data.type === "error") {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(data.message));
      }
      this.pending.clear();
    }
  };
}
