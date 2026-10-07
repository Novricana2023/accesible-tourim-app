import type { LandmarkIn, LandmarkOut } from "./landmarkMessages";

type HandLandmarkerLike = {
  detect(image: ImageBitmap): {
    landmarks: Array<Array<{ x: number; y: number; z?: number }>>;
    handedness: Array<Array<{ categoryName?: string }>>;
  };
  close(): void;
};

let landmarker: HandLandmarkerLike | null = null;

self.onmessage = (event: MessageEvent<LandmarkIn>) => {
  void handle(event.data);
};

async function handle(message: LandmarkIn): Promise<void> {
  try {
    if (message.type === "init") {
      await init(message);
      return;
    }
    if (message.type === "dispose") {
      landmarker?.close();
      landmarker = null;
      return;
    }
    if (message.type === "frame") {
      await detectFrame(message);
    }
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : "The landmark worker failed.",
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

async function init(message: Extract<LandmarkIn, { type: "init" }>): Promise<void> {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks(message.wasmPath);
  const delegates = ["GPU", "CPU"] as const;
  let lastError: unknown;
  for (const delegate of delegates) {
    try {
      const created = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: message.modelUrl,
          delegate,
        },
        runningMode: "IMAGE",
        numHands: 2,
      });
      landmarker = created;
      post({ type: "ready" });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "unknown error";
  throw new Error(`MediaPipe HandLandmarker failed to start (${detail}).`);
}

async function detectFrame(
  message: Extract<LandmarkIn, { type: "frame" }>,
): Promise<void> {
  if (!landmarker) {
    try {
      message.bitmap.close();
    } catch {
      /* ignore */
    }
    post({ type: "error", message: "Hand tracking is not ready." });
    return;
  }
  const started = performance.now();
  const result = landmarker.detect(message.bitmap);
  const inferMs = performance.now() - started;
  try {
    message.bitmap.close();
  } catch {
    /* ignore */
  }

  const hands = (result.landmarks ?? []).map((points) => {
    const flat: number[] = [];
    for (const point of points) {
      flat.push(point.x, point.y, point.z ?? 0);
    }
    return flat;
  });
  const handedness = (result.handedness ?? []).map((entry) => {
    const name = entry[0]?.categoryName;
    if (name === "Left" || name === "Right") {
      return name;
    }
    return "unknown" as const;
  });

  post({
    type: "landmarks",
    frameId: message.frameId,
    timestampMs: message.timestampMs,
    inferMs,
    hands,
    handedness,
  });
}

function post(message: LandmarkOut): void {
  self.postMessage(message);
}
