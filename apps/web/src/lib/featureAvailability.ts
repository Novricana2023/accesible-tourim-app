import type { CapabilityReport, UserPrefs } from "@mara/shared";
import type { NavigationStatus } from "@/modules/navigation";
import type { OcrStatus } from "@/modules/ocr/OcrRuntime";
import type { PerceptionStatus } from "@/modules/perception/PerceptionRuntime";

export type FeatureId = "vision" | "read" | "navigate" | "sign";

export type FeatureUiStatus = "checking" | "ready" | "active" | "unavailable";

export interface FeatureAvailability {
  status: FeatureUiStatus;
  reason: string | null;
}

export function visionAvailability(input: {
  capabilities: CapabilityReport | null;
  mode: string;
  perceptionStatus: PerceptionStatus;
}): FeatureAvailability {
  if (!input.capabilities) {
    return { status: "checking", reason: "Checking this device." };
  }
  if (!input.capabilities.available.camera) {
    return { status: "unavailable", reason: "No camera was found on this device." };
  }
  const running =
    input.mode === "assist" &&
    (input.perceptionStatus === "live" ||
      input.perceptionStatus === "loading" ||
      input.perceptionStatus === "paused");
  if (running) {
    return { status: "active", reason: null };
  }
  return { status: "ready", reason: null };
}

export function readAvailability(input: {
  capabilities: CapabilityReport | null;
  prefs: UserPrefs;
  ocrStatus: OcrStatus;
  ocrAssetsOk: boolean | null;
  ocrAssetsReason: string | null;
}): FeatureAvailability {
  if (!input.capabilities) {
    return { status: "checking", reason: "Checking this device." };
  }
  if (!input.prefs.ocrEnabled) {
    return { status: "unavailable", reason: "Reading is turned off in Settings." };
  }
  if (!input.capabilities.available.camera) {
    return { status: "unavailable", reason: "No camera was found on this device." };
  }
  if (input.ocrAssetsOk === null) {
    return { status: "checking", reason: "Checking reading assets." };
  }
  if (input.ocrAssetsOk === false) {
    return {
      status: "unavailable",
      reason: input.ocrAssetsReason ?? "Reading assets are not installed.",
    };
  }
  const running =
    input.ocrStatus === "live" ||
    input.ocrStatus === "loading" ||
    input.ocrStatus === "paused";
  if (running) {
    return { status: "active", reason: null };
  }
  return { status: "ready", reason: null };
}

export function navigateAvailability(input: {
  capabilities: CapabilityReport | null;
  navigationStatus: NavigationStatus;
}): FeatureAvailability {
  if (!input.capabilities) {
    return { status: "checking", reason: "Checking this device." };
  }
  if (!input.capabilities.available.camera) {
    return { status: "unavailable", reason: "No camera was found on this device." };
  }
  if (input.navigationStatus === "live") {
    return { status: "active", reason: null };
  }
  return { status: "ready", reason: null };
}

export function signAvailability(input: {
  capabilities: CapabilityReport | null;
  mode: string;
  signStatus: string;
}): FeatureAvailability {
  if (!input.capabilities) {
    return { status: "checking", reason: "Checking this device." };
  }
  if (!input.capabilities.available.camera) {
    return { status: "unavailable", reason: "No camera was found on this device." };
  }
  const running =
    input.mode === "communicate" &&
    (input.signStatus === "live" || input.signStatus === "loading");
  if (running) {
    return { status: "active", reason: null };
  }
  return { status: "ready", reason: null };
}
