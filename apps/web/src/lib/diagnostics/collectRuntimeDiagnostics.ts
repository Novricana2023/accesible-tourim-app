import type { CameraService } from "@/modules/camera/CameraService";
import type { PerceptionStatus } from "@/modules/perception/PerceptionRuntime";
import type { SignViewState } from "@/modules/sign-language";
import { publicAssetUrl } from "@/lib/publicAssetUrl";
import { HAND_LANDMARKER_TASK, SIGN_ONNX_URL } from "@/modules/sign-language/signAssets";
import { listSpeechVoices } from "@/lib/speech/voices";

export interface RuntimeDiagnosticsSnapshot {
  capturedAtMs: number;
  camera: {
    apiAvailable: boolean;
    secureContext: boolean;
    status: string;
    streamActive: boolean;
    videoWidth: number;
    videoHeight: number;
    facingMode: string | null;
    trackState: string | null;
    lastError: string | null;
  };
  sign: {
    status: string;
    classifierId: string | null;
    classifierReady: boolean;
    landmarksReady: boolean;
    handsDetected: number;
    lastGloss: string | null;
    confidence: number | null;
    reason: string | null;
    onnxUrl: string;
    handTaskUrl: string;
  };
  navigation: {
    perceptionStatus: PerceptionStatus;
    perceptionUnavailable: string | null;
  };
  speech: {
    synthesisAvailable: boolean;
    voiceCount: number;
    speaking: boolean;
  };
}

export function collectRuntimeDiagnostics(input: {
  camera: CameraService;
  signView: SignViewState;
  perceptionStatus: PerceptionStatus;
  perceptionUnavailable: string | null;
  speaking: boolean;
}): RuntimeDiagnosticsSnapshot {
  const video = input.camera.getVideo();
  const stream = input.camera.getStream();
  const track = stream?.getVideoTracks()[0] ?? null;
  const packId = input.signView.packId ?? "asl";

  return {
    capturedAtMs: Date.now(),
    camera: {
      apiAvailable:
        typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
      secureContext: typeof window !== "undefined" && window.isSecureContext,
      status: input.camera.getStatus(),
      streamActive: Boolean(stream && track?.readyState === "live"),
      videoWidth: video?.videoWidth ?? 0,
      videoHeight: video?.videoHeight ?? 0,
      facingMode: input.camera.getOptions()?.facingMode ?? null,
      trackState: track?.readyState ?? null,
      lastError: input.camera.getLastError()?.message ?? null,
    },
    sign: {
      status: input.signView.status,
      classifierId: input.signView.classifierId,
      classifierReady: input.signView.classifierReady,
      landmarksReady: input.signView.landmarksReady,
      handsDetected: input.signView.handsDetected,
      lastGloss: input.signView.lastGloss,
      confidence: input.signView.confidence,
      reason: input.signView.reason,
      onnxUrl: publicAssetUrl(SIGN_ONNX_URL[packId]),
      handTaskUrl: publicAssetUrl(HAND_LANDMARKER_TASK),
    },
    navigation: {
      perceptionStatus: input.perceptionStatus,
      perceptionUnavailable: input.perceptionUnavailable,
    },
    speech: {
      synthesisAvailable:
        typeof window !== "undefined" && "speechSynthesis" in window,
      voiceCount: listSpeechVoices().length,
      speaking: input.speaking,
    },
  };
}
