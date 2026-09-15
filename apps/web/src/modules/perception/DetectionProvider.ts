import type { CameraFrame } from "@mara/shared";

export interface RawDetection {
  label: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
}

export interface DetectionProvider {
  readonly id: string;
  readonly inputSize: 320 | 416 | 640;
  readonly labels: readonly string[];
  load(): Promise<{ backend: "webgpu" | "wasm" }>;
  infer(frame: CameraFrame): Promise<{
    detections: RawDetection[];
    inferenceMs: number;
    backend: "webgpu" | "wasm";
  }>;
  configureInputSize?(size: 320 | 416 | 640): void;
  configureScoreThreshold?(threshold: number): void;
  dispose(): Promise<void>;
}

export type DetectionProviderId = "yolo8n-onnx";

export interface DetectionProviderOptions {
  modelUrl: string;
  labels: readonly string[];
  inputSize?: 320 | 416 | 640;
  scoreThreshold?: number;
  preferredBackend?: "webgpu" | "wasm";
  createWorker?: () => Worker;
}
