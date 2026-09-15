import type { DetectionProvider, DetectionProviderId } from "./DetectionProvider";
import { OrtYoloProvider } from "./OrtYoloProvider";

export interface ModelManifest {
  id: DetectionProviderId;
  name: string;
  version: string;
  file: string;
  sha256: string;
  inputSize: 320 | 416 | 640;
  labels: string[];
  license: string;
  licenseNote: string;
  sourceUrl: string;
}

export async function loadModelManifest(
  url = "/models/manifest.json",
): Promise<ModelManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("The model manifest is missing. Run npm run models in apps/web.");
  }
  return (await response.json()) as ModelManifest;
}

import { resourceExists } from "@/lib/resourceExists";

export async function createDetectionProvider(
  preferredBackend: "webgpu" | "wasm",
  manifestUrl = "/models/manifest.json",
  scoreThreshold = 0.45,
): Promise<DetectionProvider> {
  const manifest = await loadModelManifest(manifestUrl);
  const modelUrl = `/models/${manifest.file}`;
  const present = await resourceExists(modelUrl);
  if (!present) {
    throw new Error(
      `The detector weights (${manifest.file}) are not installed. Run npm run models in apps/web.`,
    );
  }

  if (manifest.id !== "yolo8n-onnx") {
    throw new Error(`Unknown detection provider: ${manifest.id}.`);
  }

  return new OrtYoloProvider(manifest.id, {
    modelUrl,
    labels: manifest.labels,
    inputSize: manifest.inputSize,
    scoreThreshold,
    preferredBackend,
  });
}
