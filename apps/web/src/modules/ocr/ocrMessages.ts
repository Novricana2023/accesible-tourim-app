import type { OcrBox } from "./ocrGeometry";

export type OcrIn =
  | {
      type: "init";
      lang: string;
      workerPath: string;
      corePath: string;
      langPath: string;
      gzip: boolean;
    }
  | { type: "frame"; frameId: number; timestampMs: number; bitmap: ImageBitmap }
  | { type: "cancel" }
  | { type: "dispose" };

export type OcrOut =
  | { type: "ready"; engine: "tesseract"; language: string }
  | {
      type: "text";
      frameId: number;
      inferMs: number;
      regions: OcrBox[];
    }
  | { type: "error"; message: string; frameId?: number };
