import type { CameraFrame } from "@mara/shared";
import type { CameraService } from "@/modules/camera/CameraService";
import type { LandmarkOut } from "./landmarkMessages";
import {
  HAND_LANDMARKER_TASK,
  MEDIAPIPE_WASM_DIR,
  probeHandLandmarkerAssets,
} from "./signAssets";
import type { LandmarkExtractor, LandmarkFrame } from "./types";
import { LANDMARKS_MISSING_REASON } from "./types";

const CONSUMER_ID = "sign-language";
const DEFAULT_FPS = 16;

function wasmPath(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${MEDIAPIPE_WASM_DIR}`;
  }
  return MEDIAPIPE_WASM_DIR;
}

function modelUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${HAND_LANDMARKER_TASK}`;
  }
  return HAND_LANDMARKER_TASK;
}

export class MediaPipeLandmarkExtractor implements LandmarkExtractor {
  private worker: Worker | null = null;
  private unsubscribe: (() => void) | null = null;
  private onLandmarks: ((frame: LandmarkFrame) => void) | null = null;
  private onError: ((reason: string) => void) | null = null;
  private inflight = false;
  private targetFps = DEFAULT_FPS;

  async start(
    onLandmarks: (frame: LandmarkFrame) => void,
    onError: (reason: string) => void,
  ): Promise<void> {
    this.onLandmarks = onLandmarks;
    this.onError = onError;
    const present = await probeHandLandmarkerAssets();
    if (!present) {
      throw new Error(LANDMARKS_MISSING_REASON);
    }

    this.worker = new Worker(new URL("./landmark.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", this.onMessage);

    await new Promise<void>((resolve, reject) => {
      const onReady = (event: MessageEvent<LandmarkOut>) => {
        if (event.data.type === "ready") {
          this.worker?.removeEventListener("message", onReady);
          resolve();
          return;
        }
        if (event.data.type === "error") {
          this.worker?.removeEventListener("message", onReady);
          reject(new Error(event.data.message));
        }
      };
      this.worker?.addEventListener("message", onReady);
      this.worker?.postMessage({
        type: "init",
        wasmPath: wasmPath(),
        modelUrl: modelUrl(),
      });
    });
  }

  setTargetFps(fps: number): void {
    if (Number.isFinite(fps) && fps > 0) {
      this.targetFps = fps;
    }
  }

  attachCamera(camera: CameraService): void {
    this.unsubscribe?.();
    this.unsubscribe = camera.subscribe(CONSUMER_ID, this.targetFps, (frame) => {
      void this.ingestFrame(frame);
    });
  }

  async ingestBitmap(
    bitmap: ImageBitmap,
    frameId: number,
    timestampMs: number,
  ): Promise<void> {
    if (!this.worker || this.inflight) {
      try {
        bitmap.close();
      } catch {
        /* ignore */
      }
      return;
    }
    this.inflight = true;
    this.worker.postMessage(
      { type: "frame", frameId, timestampMs, bitmap },
      [bitmap],
    );
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.worker) {
      this.worker.postMessage({ type: "dispose" });
      this.worker.removeEventListener("message", this.onMessage);
      this.worker.terminate();
      this.worker = null;
    }
    this.inflight = false;
    this.onLandmarks = null;
    this.onError = null;
  }

  private async ingestFrame(frame: CameraFrame): Promise<void> {
    await this.ingestBitmap(frame.bitmap, frame.frameId, frame.timestampMs);
  }

  private onMessage = (event: MessageEvent<LandmarkOut>): void => {
    const data = event.data;
    if (data.type === "landmarks") {
      this.inflight = false;
      this.onLandmarks?.({
        timestampMs: data.timestampMs,
        hands: data.hands,
        handedness: data.handedness,
      });
      return;
    }
    if (data.type === "error") {
      this.inflight = false;
      this.onError?.(data.message);
    }
  };
}
