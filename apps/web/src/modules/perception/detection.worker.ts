import * as ort from "onnxruntime-web";
import { fetchModelBytes } from "@/lib/modelCache";
import type { DetectionIn, DetectionOut } from "./detectionMessages";
import { decodeYoloOutput, type LetterboxMeta } from "./yoloPostprocess";

let session: ort.InferenceSession | null = null;
let backend: "webgpu" | "wasm" = "wasm";
let inputSize: 320 | 416 | 640 = 640;
let inputName = "images";
let labels: string[] = [];
let scoreThreshold = 0.45;
let letterboxCanvas: OffscreenCanvas | null = null;

self.onmessage = (event: MessageEvent<DetectionIn>) => {
  void handle(event.data);
};

async function handle(message: DetectionIn): Promise<void> {
  try {
    if (message.type === "init") {
      await init(message);
      return;
    }
    if (message.type === "configure") {
      if (message.inputSize !== undefined) {
        inputSize = message.inputSize;
      }
      if (message.scoreThreshold !== undefined) {
        scoreThreshold = message.scoreThreshold;
      }
      return;
    }
    if (message.type === "dispose") {
      await session?.release();
      session = null;
      letterboxCanvas = null;
      return;
    }
    if (message.type === "frame") {
      await inferFrame(message);
    }
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : "Detection worker failed.",
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

async function init(message: Extract<DetectionIn, { type: "init" }>): Promise<void> {
  labels = message.labels;
  inputSize = message.inputSize;
  scoreThreshold = message.scoreThreshold;
  ort.env.wasm.wasmPaths = message.wasmPaths;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;

  const order =
    message.backend === "webgpu" ? (["webgpu", "wasm"] as const) : (["wasm"] as const);

  let modelBytes: ArrayBuffer;
  try {
    modelBytes = await fetchModelBytes(message.modelUrl);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    post({
      type: "error",
      message: `ONNX Runtime could not load the detector (${detail}).`,
    });
    return;
  }

  let lastError: unknown;
  for (const provider of order) {
    try {
      session = await ort.InferenceSession.create(modelBytes.slice(0), {
        executionProviders: [provider],
        graphOptimizationLevel: "all",
      });
      backend = provider;
      inputName = session.inputNames[0] ?? "images";
      post({ type: "ready", backend });
      return;
    } catch (error) {
      lastError = error;
      session = null;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "unknown error";
  post({
    type: "error",
    message: `ONNX Runtime could not load the detector (${detail}).`,
  });
}

async function inferFrame(
  message: Extract<DetectionIn, { type: "frame" }>,
): Promise<void> {
  if (!session) {
    message.bitmap.close();
    post({ type: "error", message: "Detector is not initialized." });
    return;
  }

  const started = performance.now();
  const { tensor, letterbox } = bitmapToTensor(message.bitmap, inputSize);
  let outputs: Record<string, ort.Tensor> | null = null;
  try {
    outputs = await session.run({ [inputName]: tensor });
    const first = outputs[session.outputNames[0]];
    const detections = decodeYoloOutput(
      first.data as Float32Array,
      first.dims,
      labels,
      scoreThreshold,
      letterbox,
    );

    post({
      type: "boxes",
      frameId: message.frameId,
      inferMs: performance.now() - started,
      detections,
    });
  } finally {
    tensor.dispose();
    try {
      message.bitmap.close();
    } catch {
      /* already closed */
    }
    if (outputs) {
      for (const name of session.outputNames) {
        outputs[name]?.dispose();
      }
    }
  }
}

function bitmapToTensor(
  bitmap: ImageBitmap,
  size: number,
): { tensor: ort.Tensor; letterbox: LetterboxMeta } {
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const drawW = bitmap.width * scale;
  const drawH = bitmap.height * scale;
  const padX = (size - drawW) / 2;
  const padY = (size - drawH) / 2;

  const canvas = getLetterboxCanvas(size);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("OffscreenCanvas is not available in the detection worker.");
  }
  context.fillStyle = "#000";
  context.fillRect(0, 0, size, size);
  context.drawImage(bitmap, padX, padY, drawW, drawH);
  const pixels = context.getImageData(0, 0, size, size).data;

  const float = new Float32Array(3 * size * size);
  let p = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    float[p] = pixels[i] / 255;
    float[size * size + p] = pixels[i + 1] / 255;
    float[2 * size * size + p] = pixels[i + 2] / 255;
    p += 1;
  }

  return {
    tensor: new ort.Tensor("float32", float, [1, 3, size, size]),
    letterbox: {
      scale,
      padX,
      padY,
      inputSize: size,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
    },
  };
}

function getLetterboxCanvas(size: number): OffscreenCanvas {
  if (!letterboxCanvas || letterboxCanvas.width !== size || letterboxCanvas.height !== size) {
    letterboxCanvas = new OffscreenCanvas(size, size);
  }
  return letterboxCanvas;
}

function post(message: DetectionOut): void {
  self.postMessage(message);
}
