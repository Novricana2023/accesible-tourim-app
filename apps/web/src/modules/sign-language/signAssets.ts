import type { SignLanguagePackId } from "@mara/shared";
import { resourceExists } from "@/lib/resourceExists";

export const SIGN_ONNX_URL: Record<SignLanguagePackId, string> = {
  asl: "/models/sign-language/asl.onnx",
  sasl: "/models/sign-language/sasl.onnx",
  bsl: "/models/sign-language/bsl.onnx",
};

export const SIGN_LABELS_URL: Record<SignLanguagePackId, string> = {
  asl: "/models/sign-language/asl.labels.json",
  sasl: "/models/sign-language/sasl.labels.json",
  bsl: "/models/sign-language/bsl.labels.json",
};

export const HAND_LANDMARKER_TASK = "/models/mediapipe/hand_landmarker.task";
export const MEDIAPIPE_WASM_DIR = "/mediapipe/wasm";

export async function probeSignClassifierAssets(
  packId: SignLanguagePackId,
): Promise<boolean> {
  return (
    (await resourceExists(SIGN_ONNX_URL[packId])) &&
    (await resourceExists(SIGN_LABELS_URL[packId]))
  );
}

export async function probeHandLandmarkerAssets(): Promise<boolean> {
  return resourceExists(HAND_LANDMARKER_TASK);
}
