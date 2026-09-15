import type { CameraFrame } from "@mara/shared";
import { defaultOrtWasmPaths } from "@/lib/ort";
import type {
  DetectionProvider,
  DetectionProviderOptions,
  RawDetection,
} from "./DetectionProvider";
import type { DetectionOut } from "./detectionMessages";

export class OrtYoloProvider implements DetectionProvider {
  readonly id: string;
  inputSize: 320 | 416 | 640;
  readonly labels: readonly string[];
  private readonly options: DetectionProviderOptions;
  private worker: Worker | null = null;
  private backend: "webgpu" | "wasm" = "wasm";
  private readonly pending = new Map<
    number,
    {
      resolve: (value: {
        detections: RawDetection[];
        inferenceMs: number;
        backend: "webgpu" | "wasm";
      }) => void;
      reject: (error: Error) => void;
    }
  >();
  private ready: Promise<{ backend: "webgpu" | "wasm" }> | null = null;

  constructor(id: string, options: DetectionProviderOptions) {
    this.id = id;
    this.inputSize = options.inputSize ?? 640;
    this.labels = options.labels;
    this.options = options;
  }

  async load(): Promise<{ backend: "webgpu" | "wasm" }> {
    if (this.ready) {
      return this.ready;
    }
    this.ready = this.openSession();
    return this.ready;
  }

  async infer(frame: CameraFrame): Promise<{
    detections: RawDetection[];
    inferenceMs: number;
    backend: "webgpu" | "wasm";
  }> {
    if (!this.worker) {
      frame.bitmap.close();
      throw new Error("Detection provider is not loaded.");
    }

    return new Promise((resolve, reject) => {
      this.pending.set(frame.frameId, { resolve, reject });
      this.worker?.postMessage(
        {
          type: "frame",
          frameId: frame.frameId,
          timestampMs: frame.timestampMs,
          bitmap: frame.bitmap,
        },
        [frame.bitmap],
      );
    });
  }

  configureInputSize(size: 320 | 416 | 640): void {
    this.inputSize = size;
    this.worker?.postMessage({ type: "configure", inputSize: size });
  }

  configureScoreThreshold(threshold: number): void {
    this.worker?.postMessage({ type: "configure", scoreThreshold: threshold });
  }

  async dispose(): Promise<void> {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Detection provider was disposed."));
    }
    this.pending.clear();
    if (this.worker) {
      this.worker.postMessage({ type: "dispose" });
      this.worker.removeEventListener("message", this.onMessage);
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = null;
  }

  private async openSession(): Promise<{ backend: "webgpu" | "wasm" }> {
    this.worker =
      this.options.createWorker?.() ??
      new Worker(new URL("./detection.worker.ts", import.meta.url), {
        type: "module",
      });
    this.worker.addEventListener("message", this.onMessage);

    return new Promise((resolve, reject) => {
      const onReady = (event: MessageEvent<DetectionOut>) => {
        if (event.data.type === "ready") {
          this.backend = event.data.backend;
          this.worker?.removeEventListener("message", onReady);
          resolve({ backend: event.data.backend });
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
        modelUrl: this.options.modelUrl,
        backend: this.options.preferredBackend ?? "wasm",
        inputSize: this.inputSize,
        labels: [...this.labels],
        scoreThreshold: this.options.scoreThreshold ?? 0.45,
        wasmPaths: defaultOrtWasmPaths(),
      });
    });
  }

  private onMessage = (event: MessageEvent<DetectionOut>): void => {
    const data = event.data;
    if (data.type === "boxes") {
      const pending = this.pending.get(data.frameId);
      if (!pending) {
        return;
      }
      this.pending.delete(data.frameId);
      pending.resolve({
        detections: data.detections,
        inferenceMs: data.inferMs,
        backend: this.backend,
      });
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
