import type { CameraFrame } from "@mara/shared";
import type { OcrBox } from "./ocrGeometry";
import type { OcrOut } from "./ocrMessages";

export interface OcrRecognizeResult {
  regions: OcrBox[];
  inferenceMs: number;
  engine: "tesseract";
}

export interface OcrProvider {
  readonly id: string;
  load(language: string): Promise<{ engine: "tesseract"; language: string }>;
  recognize(frame: CameraFrame): Promise<OcrRecognizeResult>;
  dispose(): Promise<void>;
}

export function tesseractAssetUrls(origin = defaultOrigin()): {
  workerPath: string;
  corePath: string;
  langPath: string;
} {
  return {
    workerPath: `${origin}/tesseract/worker.min.js`,
    corePath: `${origin}/tesseract/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${origin}/tesseract/lang`,
  };
}

function defaultOrigin(): string {
  if (typeof self !== "undefined" && "location" in self && self.location?.origin) {
    return self.location.origin;
  }
  return "";
}

export class TesseractOcrProvider implements OcrProvider {
  readonly id = "tesseract-lstm";
  private worker: Worker | null = null;
  private ready: Promise<{ engine: "tesseract"; language: string }> | null = null;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: OcrRecognizeResult) => void;
      reject: (error: Error) => void;
    }
  >();
  private readonly createWorkerFn: () => Worker;

  constructor(createWorkerFn?: () => Worker) {
    this.createWorkerFn =
      createWorkerFn ??
      (() =>
        new Worker(new URL("./ocr.worker.ts", import.meta.url), {
          type: "module",
        }));
  }

  async load(language: string): Promise<{ engine: "tesseract"; language: string }> {
    if (this.ready) {
      return this.ready;
    }
    this.ready = this.open(language);
    return this.ready;
  }

  async recognize(frame: CameraFrame): Promise<OcrRecognizeResult> {
    if (!this.worker) {
      try {
        frame.bitmap.close();
      } catch {
        /* ignore */
      }
      throw new Error("OCR is not loaded.");
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

  async dispose(): Promise<void> {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("OCR was stopped."));
    }
    this.pending.clear();
    if (this.worker) {
      this.worker.postMessage({ type: "cancel" });
      this.worker.postMessage({ type: "dispose" });
      this.worker.removeEventListener("message", this.onMessage);
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = null;
  }

  private async open(
    language: string,
  ): Promise<{ engine: "tesseract"; language: string }> {
    this.worker = this.createWorkerFn();
    this.worker.addEventListener("message", this.onMessage);
    const assets = tesseractAssetUrls();
    const lang = language.toLowerCase().startsWith("en") ? "eng" : "eng";
    return new Promise((resolve, reject) => {
      const onReady = (event: MessageEvent<OcrOut>) => {
        if (event.data.type === "ready") {
          this.worker?.removeEventListener("message", onReady);
          resolve({ engine: "tesseract", language: event.data.language });
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
        lang,
        workerPath: assets.workerPath,
        corePath: assets.corePath,
        langPath: assets.langPath,
        gzip: true,
      });
    });
  }

  private onMessage = (event: MessageEvent<OcrOut>): void => {
    const data = event.data;
    if (data.type === "text") {
      const pending = this.pending.get(data.frameId);
      if (!pending) {
        return;
      }
      this.pending.delete(data.frameId);
      pending.resolve({
        regions: data.regions,
        inferenceMs: data.inferMs,
        engine: "tesseract",
      });
      return;
    }
    if (data.type === "error") {
      if (data.frameId !== undefined) {
        const pending = this.pending.get(data.frameId);
        if (pending) {
          this.pending.delete(data.frameId);
          pending.reject(new Error(data.message));
          return;
        }
      }
      for (const pending of this.pending.values()) {
        pending.reject(new Error(data.message));
      }
      this.pending.clear();
    }
  };
}
