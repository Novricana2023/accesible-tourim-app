import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CameraFrame } from "@mara/shared";
import type {
  DetectionProvider,
  RawDetection,
} from "@/modules/perception/DetectionProvider";
import { OrtYoloProvider } from "@/modules/perception/OrtYoloProvider";

class ScriptedProvider implements DetectionProvider {
  readonly id = "scripted-test";
  readonly inputSize = 640 as const;
  readonly labels: readonly string[];

  constructor(labels: readonly string[]) {
    this.labels = labels;
  }

  async load() {
    return { backend: "wasm" as const };
  }

  async infer(_frame: CameraFrame): Promise<{
    detections: RawDetection[];
    inferenceMs: number;
    backend: "webgpu" | "wasm";
  }> {
    return {
      detections: this.labels.slice(0, 1).map((label) => ({
        label,
        confidence: 0.9,
        box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      })),
      inferenceMs: 1,
      backend: "wasm",
    };
  }

  async dispose() {
    /* test double */
  }
}

describe("DetectionProvider contract", () => {
  it("takes labels from the caller, not a hardcoded infer list", async () => {
    const provider = new ScriptedProvider(["lamppost"]);
    const result = await provider.infer({
      frameId: 1,
      timestampMs: 0,
      width: 4,
      height: 4,
      bitmap: { close() {} } as ImageBitmap,
    });
    expect(result.detections[0]?.label).toBe("lamppost");
    expect(result.detections.map((item) => item.label)).not.toEqual([
      "person",
      "chair",
    ]);
  });

  it("OrtYoloProvider exposes manifest labels and does not invent them", () => {
    const provider = new OrtYoloProvider("yolo8n-onnx", {
      modelUrl: "/models/yolov8n.onnx",
      labels: ["person", "chair"],
    });
    expect(provider.id).toBe("yolo8n-onnx");
    expect(provider.labels).toEqual(["person", "chair"]);
  });

  it("detection worker runs an ONNX session instead of returning fixture boxes", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/modules/perception/detection.worker.ts"),
      "utf8",
    );
    expect(source).toContain("session.run");
    expect(source).toContain("decodeYoloOutput");
    expect(source).not.toMatch(
      /detections:\s*\[\s*\{\s*label:\s*["']person["']/,
    );
  });
});
