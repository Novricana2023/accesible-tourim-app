import { fetchCachedFirst, resourceExists } from "@/lib/resourceExists";
import type { ModelManifest } from "@/modules/perception/providers";
import { probeOcrAssets } from "@/modules/ocr/ocrAssets";
import { probeHandLandmarkerAssets, probeSignClassifierAssets } from "@/modules/sign-language/signAssets";
import type { SignLanguagePackId } from "@mara/shared";

export interface LocalAiReadiness {
  detection: boolean;
  ocr: boolean;
  handLandmarks: boolean;
  signClassifier: boolean;
}

export async function probeLocalAiReadiness(
  signPackId: SignLanguagePackId = "asl",
): Promise<LocalAiReadiness> {
  const [ocr, handLandmarks, signClassifier] = await Promise.all([
    probeOcrAssets().then((result) => result.ok),
    probeHandLandmarkerAssets(),
    probeSignClassifierAssets(signPackId),
  ]);

  const detection = await probeDetectionAssets();

  return { detection, ocr, handLandmarks, signClassifier };
}

async function probeDetectionAssets(): Promise<boolean> {
  const manifestResponse = await fetchCachedFirst("/models/manifest.json");
  if (!manifestResponse?.ok) {
    return false;
  }
  let manifest: ModelManifest;
  try {
    manifest = (await manifestResponse.json()) as ModelManifest;
  } catch {
    return false;
  }
  return resourceExists(`/models/${manifest.file}`);
}

export function describeOfflineAiLimits(
  readiness: LocalAiReadiness,
  opts: { speechRecognition: boolean },
): string[] {
  const lines: string[] = [];
  lines.push(
    opts.speechRecognition
      ? "Voice control and partner captions use the browser speech service and need a network connection here."
      : "Speech recognition is not available on this device.",
  );

  lines.push(
    readiness.detection
      ? "Object detection: model files are stored on this device (starting vision still depends on the browser runtime)."
      : "Object detection: model files are not on this device. Unavailable offline.",
  );

  lines.push(
    readiness.ocr
      ? "Reading (OCR): Tesseract assets are stored on this device."
      : "Reading (OCR): Tesseract assets are not on this device. Unavailable offline.",
  );

  lines.push(
    readiness.handLandmarks
      ? "Sign hand tracking: MediaPipe assets are stored on this device."
      : "Sign hand tracking: MediaPipe assets are not on this device. Unavailable offline.",
  );

  lines.push(
    readiness.signClassifier
      ? "Sign classification: trained weights are stored on this device."
      : "Sign classification: trained weights are not on this device. Unavailable offline.",
  );

  return lines;
}
