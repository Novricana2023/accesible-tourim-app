import { createWorker, PSM } from "tesseract.js";
import type { OcrBox } from "./ocrGeometry";
import type { OcrIn, OcrOut } from "./ocrMessages";

let tess: Awaited<ReturnType<typeof createWorker>> | null = null;
let job = 0;
let ocrCanvas: OffscreenCanvas | null = null;

self.onmessage = (event: MessageEvent<OcrIn>) => {
  void handle(event.data);
};

async function handle(message: OcrIn): Promise<void> {
  try {
    if (message.type === "init") {
      await tess?.terminate();
      tess = await createWorker(message.lang, 1, {
        workerPath: message.workerPath,
        corePath: message.corePath,
        langPath: message.langPath,
        gzip: message.gzip,
        workerBlobURL: false,
        cacheMethod: "write",
        logger: () => {
          /* keep the OCR worker quiet */
        },
      });
      await tess.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      });
      post({ type: "ready", engine: "tesseract", language: message.lang });
      return;
    }
    if (message.type === "cancel") {
      job += 1;
      return;
    }
    if (message.type === "dispose") {
      job += 1;
      await tess?.terminate();
      tess = null;
      ocrCanvas = null;
      return;
    }
    if (message.type === "frame") {
      await recognizeFrame(message);
    }
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : "The OCR worker failed.",
      frameId: message.type === "frame" ? message.frameId : undefined,
    });
    if (message.type === "frame") {
      try {
        message.bitmap.close();
      } catch {
        /* already closed */
      }
    }
  }
}

async function recognizeFrame(
  message: Extract<OcrIn, { type: "frame" }>,
): Promise<void> {
  if (!tess) {
    try {
      message.bitmap.close();
    } catch {
      /* ignore */
    }
    post({
      type: "error",
      message: "OCR is not loaded.",
      frameId: message.frameId,
    });
    return;
  }

  const started = performance.now();
  const currentJob = job;
  const bitmap = message.bitmap;
  const maxWidth = 960;
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  if (!ocrCanvas || ocrCanvas.width !== width || ocrCanvas.height !== height) {
    ocrCanvas = new OffscreenCanvas(width, height);
  }
  const context = ocrCanvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("OCR could not create a canvas.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  try {
    bitmap.close();
  } catch {
    /* transferred */
  }
  const recognized = await tess.recognize(ocrCanvas, undefined, {
    text: true,
    blocks: true,
  });
  if (currentJob !== job) {
    return;
  }

  const lines =
    recognized.data.blocks?.flatMap((block) =>
      block.paragraphs.flatMap((paragraph) => paragraph.lines),
    ) ?? [];
  const regions: OcrBox[] = lines.map((item) => ({
    text: item.text ?? "",
    confidence: (item.confidence ?? 0) / 100,
    box: {
      x: item.bbox.x0 / width,
      y: item.bbox.y0 / height,
      w: (item.bbox.x1 - item.bbox.x0) / width,
      h: (item.bbox.y1 - item.bbox.y0) / height,
    },
  }));

  if (regions.length === 0) {
    const pageText = (recognized.data.text ?? "").trim();
    const pageConfidence = (recognized.data.confidence ?? 0) / 100;
    if (pageText) {
      regions.push({
        text: pageText,
        confidence: pageConfidence,
        box: { x: 0, y: 0, w: 1, h: 1 },
      });
    }
  }

  post({
    type: "text",
    frameId: message.frameId,
    inferMs: performance.now() - started,
    regions,
  });
}

function post(message: OcrOut): void {
  self.postMessage(message);
}
