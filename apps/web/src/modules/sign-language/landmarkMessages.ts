export type LandmarkIn =
  | {
      type: "init";
      wasmPath: string;
      modelUrl: string;
    }
  | { type: "frame"; frameId: number; timestampMs: number; bitmap: ImageBitmap }
  | { type: "dispose" };

export type LandmarkOut =
  | { type: "ready" }
  | {
      type: "landmarks";
      frameId: number;
      timestampMs: number;
      inferMs: number;
      hands: number[][];
      handedness: Array<"Left" | "Right" | "unknown">;
    }
  | { type: "error"; message: string };
