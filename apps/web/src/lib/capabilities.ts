import type { CapabilityReport } from "@mara/shared";
import { APP_NAME } from "@/app/brand";
import { probeDeviceProfile } from "@/lib/deviceProfile";

const WASM_SIMD_MODULE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

function hasWasmSimd(): boolean {
  if (typeof WebAssembly === "undefined") {
    return false;
  }
  try {
    return WebAssembly.validate(WASM_SIMD_MODULE);
  } catch {
    return false;
  }
}

function hasSpeechRecognition(): boolean {
  return Boolean(
    (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
      .SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
  );
}

type GpuNavigator = Navigator & {
  gpu?: { requestAdapter: () => Promise<unknown> };
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Capability probe timed out."));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function probeInferenceBackend(): Promise<{
  webgpu: boolean;
  inferenceBackend: CapabilityReport["inferenceBackend"];
}> {
  const wasmOk = typeof WebAssembly !== "undefined";
  const gpu = (navigator as GpuNavigator).gpu;

  if (!gpu) {
    return {
      webgpu: false,
      inferenceBackend: wasmOk ? "wasm" : "unavailable",
    };
  }

  try {
    const adapter = await withTimeout(gpu.requestAdapter(), 1500);
    if (adapter) {
      return { webgpu: true, inferenceBackend: "webgpu" };
    }
    return {
      webgpu: false,
      inferenceBackend: wasmOk ? "wasm" : "unavailable",
    };
  } catch {
    return {
      webgpu: false,
      inferenceBackend: wasmOk ? "wasm" : "unavailable",
    };
  }
}

async function probeMedia(): Promise<{
  camera: boolean;
  mic: boolean;
  notes: string[];
}> {
  const notes: string[] = [];
  const api = typeof navigator.mediaDevices?.getUserMedia === "function";

  if (!api) {
    notes.push("This browser does not expose getUserMedia. Camera and microphone actions are off.");
    return { camera: false, mic: false, notes };
  }

  if (!window.isSecureContext) {
    notes.push("Camera and microphone require a secure context (HTTPS or localhost).");
    return { camera: false, mic: false, notes };
  }

  try {
    const devices = await withTimeout(navigator.mediaDevices.enumerateDevices(), 1500);
    const hasVideo = devices.some((device) => device.kind === "videoinput");
    const hasAudio = devices.some((device) => device.kind === "audioinput");

    if (devices.length === 0) {
      notes.push(
        "Media devices have not been confirmed yet. Permission is requested when a pipeline starts.",
      );
      return { camera: true, mic: true, notes };
    }

    if (!hasVideo) {
      notes.push("No camera was listed on this device.");
    }
    if (!hasAudio) {
      notes.push("No microphone was listed on this device.");
    }

    return { camera: hasVideo, mic: hasAudio, notes };
  } catch {
    notes.push("Media device list could not be read. The capture API is present.");
    return { camera: true, mic: true, notes };
  }
}

export async function probeCapabilities(): Promise<CapabilityReport> {
  const notes: string[] = [];
  const device = probeDeviceProfile();
  const { webgpu, inferenceBackend } = await probeInferenceBackend();
  const media = await probeMedia();
  notes.push(...media.notes);

  const wasmSimd = hasWasmSimd();
  const speechSynthesis = typeof window.speechSynthesis !== "undefined";
  const speechRecognition = hasSpeechRecognition();
  const geolocation = "geolocation" in navigator;
  const orientation = "DeviceOrientationEvent" in window;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    notes.push(
      "This device reports it is offline. Installed on-device models can still run. Chrome speech recognition needs a network connection.",
    );
  }

  if (device.class === "mobile") {
    notes.push(
      `This looks like a ${device.formFactor}. Detection starts at ${device.startingInputSize}px and a lower frame rate so the device can keep up. Results still come from the real detector.`,
    );
  }

  if (!webgpu) {
    notes.push(
      inferenceBackend === "wasm"
        ? "WebGPU is not available. Inference will use WASM when models are connected."
        : "Neither WebGPU nor WebAssembly is available. On-device inference cannot run.",
    );
  } else if (device.ios) {
    notes.push(
      `WebGPU is listed, but iOS Safari GPU support is limited. If WebGPU fails, inference falls back to WASM. ${APP_NAME} will not keep a broken WebGPU session.`,
    );
  }

  if (!wasmSimd && inferenceBackend !== "unavailable") {
    notes.push("WASM SIMD is not available. WASM inference would be slower.");
  }

  if (!speechSynthesis) {
    notes.push("speechSynthesis is not available. Spoken output can use the live region only.");
  }

  if (!speechRecognition) {
    notes.push(
      "Web Speech recognition is not available. Whisper-tiny is not shipped yet, so speech-in is off.",
    );
  } else if (device.ios) {
    notes.push(
      "iOS Safari speech recognition is limited and may require a user gesture or fail even though the API exists. If it cannot start, voice control and partner captions stay off. Communicate Mode B is still shown, disabled, with this reason.",
    );
  }

  if (speechRecognition) {
    notes.push(
      `Chrome Web Speech recognition is a Google network service. ${APP_NAME} does not upload live video.`,
    );
  }

  if (!geolocation) {
    notes.push(
      "Geolocation is not available. Outdoor turn-by-turn routing cannot start. Camera path assistance does not need GPS.",
    );
  }

  if (!orientation) {
    notes.push("Device orientation is not available. Heading will be unavailable for navigation.");
  }

  if (!window.isSecureContext) {
    notes.push("Camera and microphone require HTTPS or localhost.");
  }

  return {
    available: {
      webgpu,
      "wasm-simd": wasmSimd,
      camera: media.camera,
      mic: media.mic,
      "speech-recognition": speechRecognition,
      "speech-synthesis": speechSynthesis,
      geolocation,
      orientation,
    },
    inferenceBackend,
    speechInEngine: speechRecognition ? "webspeech" : "unavailable",
    notes,
    deviceClass: device.class,
  };
}
