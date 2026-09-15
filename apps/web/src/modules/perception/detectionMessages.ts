import type { RawDetection } from "./DetectionProvider";

export type DetectionIn =
  | {
      type: "init";
      modelUrl: string;
      backend: "webgpu" | "wasm";
      inputSize: 320 | 416 | 640;
      labels: string[];
      scoreThreshold: number;
      wasmPaths: string;
    }
  | { type: "frame"; frameId: number; timestampMs: number; bitmap: ImageBitmap }
  | { type: "configure"; inputSize?: 320 | 416 | 640; scoreThreshold?: number }
  | { type: "dispose" };

export type DetectionOut =
  | { type: "ready"; backend: "webgpu" | "wasm" }
  | {
      type: "boxes";
      frameId: number;
      inferMs: number;
      detections: RawDetection[];
    }
  | { type: "error"; message: string };
