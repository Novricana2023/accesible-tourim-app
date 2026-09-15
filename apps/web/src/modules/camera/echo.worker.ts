export type EchoIn = {
  type: "frame";
  frameId: number;
  timestampMs: number;
  bitmap: ImageBitmap;
};

export type EchoOut =
  | {
      type: "echo";
      frameId: number;
      timestampMs: number;
      meanLuma: number;
    }
  | { type: "error"; message: string };

self.onmessage = (event: MessageEvent<EchoIn>) => {
  const data = event.data;
  if (!data || data.type !== "frame") {
    return;
  }

  const { frameId, timestampMs, bitmap } = data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      self.postMessage({
        type: "error",
        message: "Echo worker could not read the frame.",
      } satisfies EchoOut);
      return;
    }
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let sum = 0;
    const count = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    }
    bitmap.close();
    self.postMessage({
      type: "echo",
      frameId,
      timestampMs,
      meanLuma: count > 0 ? sum / count : 0,
    } satisfies EchoOut);
  } catch {
    try {
      bitmap.close();
    } catch {
      /* already closed */
    }
    self.postMessage({
      type: "error",
      message: "Echo worker failed to process a frame.",
    } satisfies EchoOut);
  }
};
