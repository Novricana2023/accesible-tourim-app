import type {
  AssistCommand,
  AssistCommandName,
  CapabilityReport,
  DetectedObject,
  DetectionResult,
  Mode,
  OcrResult,
  RuntimeEvent,
  UserPrefs,
} from "@mara/shared";
import {
  clampDetectionSensitivity,
  clampOcrEmptyAnnounceMs,
  clampSpeechRate,
  clampSpeechVolume,
  sanitizeSpeechInLocale,
  scoreThresholdFromSensitivity,
} from "@mara/shared";
import { cameraRequestWithPrefs } from "@/lib/cameraPrefs";
import { createDetectionProvider } from "@/modules/perception/providers";
import { APP_NAME } from "@/app/brand";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { createEventBus } from "@/app/EventBus";
import { ModeController } from "@/app/ModeController";
import { SpeechManager } from "@/modules/speech/SpeechManager";
import { probeCapabilities } from "@/lib/capabilities";
import { probeLocalAiReadiness } from "@/lib/pwa/localAiReadiness";
import { probeDeviceProfile } from "@/lib/deviceProfile";
import { createLatestWinsThrottle } from "@/lib/uiThrottle";
import { CameraService } from "@/modules/camera/CameraService";
import { EchoConsumer } from "@/modules/camera/EchoConsumer";
import type { CameraError, CameraStatus } from "@/modules/camera/types";
import { teardownContinuousVision } from "@/modules/assist/teardownContinuousVision";
import {
  PerceptionRuntime,
  type PerceptionStatus,
  type VisionLoopState,
} from "@/modules/perception/PerceptionRuntime";
import { OcrRuntime, type OcrStatus } from "@/modules/ocr/OcrRuntime";
import { OCR_ASSETS_MISSING_REASON, probeOcrAssets } from "@/modules/ocr/ocrAssets";
import {
  NavigationRuntime,
  PATH_ASSISTANCE_NEEDS_CAMERA,
  PATH_ASSISTANCE_NEEDS_VISION,
  PATH_ASSISTANCE_START_SPEECH,
  PATH_ASSISTANCE_STOP_SPEECH,
  navigationNeedsVisionStart,
  visionIsReadyForNavigation,
  type NavigationStatus,
  type PathObstacle,
} from "@/modules/navigation";
import {
  SignLanguageRuntime,
  type CommunicationSnapshot,
  type SignRuntimeStatus,
  type SignViewState,
} from "@/modules/sign-language";
import { createPrefsStore } from "@/modules/prefs/PrefsStore";
import { TtsAdapter } from "@/modules/speech/TtsAdapter";
import {
  applyAssistCommand,
  assistActivity,
  type AssistActivity,
} from "@/modules/speech/applyAssistCommand";
import {
  partnerSpeechDisclosure,
  speechInEngineDisclosure,
  SttAdapter,
  type SttEngine,
  type SttFailure,
  type SttStatus,
} from "@/modules/speech/SttAdapter";
import { routeSttTranscript } from "@/modules/speech/routeSttTranscript";
import { VoiceController } from "@/modules/speech/VoiceController";

interface MaraRuntimeValue {
  mode: Mode;
  prefs: UserPrefs;
  capabilities: CapabilityReport | null;
  lastAnnouncement: string;
  assertiveMessage: string;
  politeMessage: string;
  assertiveNonce: number;
  politeNonce: number;
  updatePrefs: (patch: Partial<UserPrefs>) => Promise<void>;
  startVision: () => Promise<void>;
  startReading: () => Promise<void>;
  stopReading: () => Promise<void>;
  startNavigation: () => Promise<void>;
  stopNavigation: () => Promise<void>;
  startCommunicate: () => Promise<void>;
  stopSignerChannel: () => Promise<void>;
  startSpeakerListening: () => Promise<void>;
  stopSpeakerListening: () => Promise<void>;
  testSignSpeechOutput: () => void;
  stop: () => Promise<void>;
  voiceStatus: SttStatus;
  voiceEngine: SttEngine;
  lastHeardCommand: AssistCommandName | null;
  lastHeardTranscript: string;
  voiceFailure: SttFailure;
  toggleVoice: () => Promise<void>;
  assistActivity: AssistActivity;
  camera: CameraService;
  cameraStatus: CameraStatus;
  cameraError: CameraError | null;
  tracks: DetectedObject[];
  detection: DetectionResult | null;
  perceptionStatus: PerceptionStatus;
  perceptionUnavailableReason: string | null;
  visionLoop: VisionLoopState | null;
  ocrStatus: OcrStatus;
  ocrResult: OcrResult | null;
  ocrAssetsOk: boolean | null;
  ocrAssetsReason: string | null;
  ocrUnavailableReason: string | null;
  navigationStatus: NavigationStatus;
  pathObstacles: PathObstacle[];
  pathInstruction: string;
  signStatus: SignRuntimeStatus;
  signView: SignViewState;
  communication: CommunicationSnapshot;
}

interface MaraSessionValue {
  mode: Mode;
  prefs: UserPrefs;
  capabilities: CapabilityReport | null;
  updatePrefs: (patch: Partial<UserPrefs>) => Promise<void>;
  startVision: () => Promise<void>;
  startReading: () => Promise<void>;
  stopReading: () => Promise<void>;
  startNavigation: () => Promise<void>;
  stopNavigation: () => Promise<void>;
  startCommunicate: () => Promise<void>;
  stopSignerChannel: () => Promise<void>;
  startSpeakerListening: () => Promise<void>;
  stopSpeakerListening: () => Promise<void>;
  testSignSpeechOutput: () => void;
  stop: () => Promise<void>;
  voiceStatus: SttStatus;
  voiceEngine: SttEngine;
  lastHeardCommand: AssistCommandName | null;
  lastHeardTranscript: string;
  voiceFailure: SttFailure;
  toggleVoice: () => Promise<void>;
  assistActivity: AssistActivity;
  camera: CameraService;
  cameraStatus: CameraStatus;
  cameraError: CameraError | null;
  perceptionStatus: PerceptionStatus;
  perceptionUnavailableReason: string | null;
  ocrStatus: OcrStatus;
  ocrAssetsOk: boolean | null;
  ocrAssetsReason: string | null;
  ocrUnavailableReason: string | null;
  navigationStatus: NavigationStatus;
  signStatus: SignRuntimeStatus;
}

interface MaraSpeechUiValue {
  lastAnnouncement: string;
  assertiveMessage: string;
  politeMessage: string;
  assertiveNonce: number;
  politeNonce: number;
}

interface MaraPerceptionUiValue {
  tracks: DetectedObject[];
  detection: DetectionResult | null;
  visionLoop: VisionLoopState | null;
  ocrResult: OcrResult | null;
  pathObstacles: PathObstacle[];
  pathInstruction: string;
}

interface MaraCommunicateUiValue {
  signView: SignViewState;
  communication: CommunicationSnapshot;
}

const MaraSessionContext = createContext<MaraSessionValue | null>(null);
const MaraSpeechUiContext = createContext<MaraSpeechUiValue | null>(null);
const MaraPerceptionUiContext = createContext<MaraPerceptionUiValue | null>(null);
const MaraCommunicateUiContext = createContext<MaraCommunicateUiValue | null>(null);

function createRuntimeServices() {
  const bus = createEventBus();
  const controller = new ModeController();
  const prefsStore = createPrefsStore();
  const tts = new TtsAdapter();
  let latestPrefs: UserPrefs | null = null;
  let announce: (text: string, politeness: "assertive" | "polite") => void = () => {
    /* set after React mounts */
  };
  let dispatchCommand: (command: AssistCommand) => void = () => {
    /* set after React mounts */
  };
  let reportHeard: (transcript: string, command: AssistCommand | null) => void = () => {
    /* set after React mounts */
  };
  let reportSttStatus: (status: SttStatus) => void = () => {
    /* set after React mounts */
  };

  const speech = new SpeechManager({
    tts,
    getPrefs: () => {
      if (!latestPrefs) {
        throw new Error("Preferences are not loaded.");
      }
      return latestPrefs;
    },
    onAnnounce: (text, politeness) => announce(text, politeness),
  });
  const voice = new VoiceController({
    isTtsSpeaking: () => speech.isSpeaking(),
    getLastSpokenText: () => speech.getLastSpokenText(),
    onCommand: (command) => dispatchCommand(command),
    onHeard: (transcript, command) => reportHeard(transcript, command),
    onBargeIn: () => speech.pauseForBargeIn(),
    onBargeInEnd: () => speech.resume(),
  });
  const camera = new CameraService();
  const echo = new EchoConsumer();
  const perception = new PerceptionRuntime({
    bus,
    createProvider: async (backend) => {
      const sensitivity = latestPrefs?.detectionSensitivity ?? 50;
      return createDetectionProvider(
        backend,
        "/models/manifest.json",
        scoreThresholdFromSensitivity(sensitivity),
      );
    },
  });
  const ocr = new OcrRuntime({ bus });
  const navigation = new NavigationRuntime({ bus });
  const sign = new SignLanguageRuntime({ bus });
  perception.setReadNowHandler(() => ocr.readNow());

  const stt = new SttAdapter({
    getLang: () => latestPrefs?.speechInLocale ?? latestPrefs?.language ?? "en-US",
    onTranscript: (text, confidence, isFinal) => {
      routeSttTranscript({
        sink: stt.getSink(),
        communicateMode: controller.current() === "communicate",
        text,
        confidence,
        isFinal,
        ingestCommunication: (spoken, isFinalTurn, echo) => {
          sign.ingestSpeaker(spoken, isFinalTurn, echo);
        },
        voice,
        echo: {
          lastSpokenText: speech.getLastSpokenText(),
          ttsSpeaking: speech.isSpeaking(),
        },
      });
    },
    onStatus: (status) => reportSttStatus(status),
  });

  return {
    bus,
    controller,
    prefsStore,
    speech,
    stt,
    voice,
    camera,
    echo,
    perception,
    ocr,
    navigation,
    sign,
    setPrefsSnapshot(prefs: UserPrefs) {
      latestPrefs = prefs;
      speech.setRate(prefs.speechRate);
      speech.setVolume(prefs.speechVolume);
      speech.setVoiceUri(prefs.speechVoiceUri, prefs.language);
      speech.setAnnouncementFrequency(prefs.announcementFrequency);
      perception.setScoreThreshold(
        scoreThresholdFromSensitivity(prefs.detectionSensitivity),
      );
    },
    setAnnounceHandler(
      handler: (text: string, politeness: "assertive" | "polite") => void,
    ) {
      announce = handler;
    },
    setCommandDispatcher(handler: (command: AssistCommand) => void) {
      dispatchCommand = handler;
    },
    setHeardHandler(
      handler: (transcript: string, command: AssistCommand | null) => void,
    ) {
      reportHeard = handler;
    },
    setSttStatusHandler(handler: (status: SttStatus) => void) {
      reportSttStatus = handler;
    },
  };
}

export function MaraRuntimeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [services] = useState(createRuntimeServices);
  const [deviceProfile] = useState(() => probeDeviceProfile());
  const [mode, setMode] = useState<Mode>(() => services.controller.current());
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityReport | null>(null);
  const [lastAnnouncement, setLastAnnouncement] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveNonce, setAssertiveNonce] = useState(0);
  const [politeNonce, setPoliteNonce] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [tracks, setTracks] = useState<DetectedObject[]>([]);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [perceptionStatus, setPerceptionStatus] =
    useState<PerceptionStatus>("idle");
  const [visionLoop, setVisionLoop] = useState<VisionLoopState | null>(null);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle");
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [ocrAssetsOk, setOcrAssetsOk] = useState<boolean | null>(null);
  const [ocrAssetsReason, setOcrAssetsReason] = useState<string | null>(null);
  const [perceptionUnavailableReason, setPerceptionUnavailableReason] = useState<
    string | null
  >(null);
  const [ocrUnavailableReason, setOcrUnavailableReason] = useState<string | null>(
    null,
  );
  const [navigationStatus, setNavigationStatus] =
    useState<NavigationStatus>("idle");
  const [pathObstacles, setPathObstacles] = useState<PathObstacle[]>([]);
  const [pathInstruction, setPathInstruction] = useState("");
  const [signStatus, setSignStatus] = useState<SignRuntimeStatus>(
    () => services.sign.getStatus(),
  );
  const [signView, setSignView] = useState<SignViewState>(() => services.sign.getView());
  const [communication, setCommunication] = useState<CommunicationSnapshot>(() =>
    services.sign.getSession().getSnapshot(),
  );
  const [voiceStatus, setVoiceStatus] = useState<SttStatus>("idle");
  const [voiceFailure, setVoiceFailure] = useState<SttFailure>(null);
  const [lastHeardCommand, setLastHeardCommand] = useState<AssistCommandName | null>(
    null,
  );
  const [lastHeardTranscript, setLastHeardTranscript] = useState("");

  useEffect(() => {
    services.setAnnounceHandler((text, politeness) => {
      setLastAnnouncement(text);
      if (politeness === "assertive") {
        setAssertiveMessage(text);
        setAssertiveNonce((current) => current + 1);
      } else {
        setPoliteMessage(text);
        setPoliteNonce((current) => current + 1);
      }
    });
    services.setSttStatusHandler((status) => {
      setVoiceStatus(status);
      const failure = services.stt.getFailure();
      setVoiceFailure(failure);
      if (status === "unavailable" && failure === "network") {
        services.speech.announceSystem(
          "Speech recognition lost its network connection. Voice control is off. Buttons still work.",
          true,
        );
      }
    });
    services.setHeardHandler((transcript, command) => {
      if (!command) {
        return;
      }
      setLastHeardTranscript(transcript);
      setLastHeardCommand(command.name);
    });
  }, [services]);

  useEffect(() => {
    if (prefs) {
      services.setPrefsSnapshot(prefs);
    }
  }, [prefs, services]);

  useEffect(() => {
    return services.controller.subscribe(setMode);
  }, [services]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const stored = await services.prefsStore.get();
      if (cancelled) {
        return;
      }
      services.setPrefsSnapshot(stored);
      setPrefs(stored);

      try {
        const assets = await probeOcrAssets();
        if (!cancelled) {
          setOcrAssetsOk(assets.ok);
          setOcrAssetsReason(assets.reason);
        }
      } catch {
        if (!cancelled) {
          setOcrAssetsOk(false);
          setOcrAssetsReason(OCR_ASSETS_MISSING_REASON);
        }
      }

      try {
        const aiReady = await probeLocalAiReadiness(stored.signPackId ?? "asl");
        if (!cancelled && !aiReady.detection) {
          setPerceptionUnavailableReason(
            "Object detection files are missing on this server. Redeploy with a full production build (npm run build:production).",
          );
        }
      } catch {
        /* probe is best-effort */
      }

      try {
        const report = await probeCapabilities();
        if (cancelled) {
          return;
        }
        setCapabilities(report);
        services.bus.emit({ type: "capabilities", report });
      } catch {
        if (cancelled) {
          return;
        }
        const fallback: CapabilityReport = {
          available: {
            webgpu: false,
            "wasm-simd": false,
            camera: false,
            mic: false,
            "speech-recognition": false,
            "speech-synthesis": typeof window.speechSynthesis !== "undefined",
            geolocation: "geolocation" in navigator,
            orientation: "DeviceOrientationEvent" in window,
          },
          inferenceBackend: typeof WebAssembly !== "undefined" ? "wasm" : "unavailable",
          speechInEngine: "unavailable",
          notes: ["Capability probe failed. Dependent actions stay off until the device can be checked."],
          deviceClass: deviceProfile.class,
        };
        setCapabilities(fallback);
        services.bus.emit({ type: "capabilities", report: fallback });
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [services]);

  useEffect(() => {
    return services.speech.attach(services.bus);
  }, [services]);

  useEffect(() => {
    return services.bus.subscribe((event) => {
      if (event.type === "speech-started") {
        services.voice.onTtsStarted();
        if (services.stt.getSink() === "communication") {
          services.stt.pauseForTts();
        }
        return;
      }
      if (event.type === "speech-ended") {
        services.voice.onTtsEnded();
        services.stt.resumeAfterTts();
      }
    });
  }, [services]);

  useEffect(() => {
    const uiHz = deviceProfile.uiHz;
    const tracksUi = createLatestWinsThrottle(uiHz, setTracks);
    const detectionUi = createLatestWinsThrottle(uiHz, setDetection);
    const loopUi = createLatestWinsThrottle(uiHz, setVisionLoop);
    const ocrUi = createLatestWinsThrottle(uiHz, setOcrResult);
    const pathUi = createLatestWinsThrottle(
      uiHz,
      (state: { obstacles: PathObstacle[]; instruction: string }) => {
        setPathObstacles(state.obstacles);
        setPathInstruction(state.instruction);
      },
    );
    const signUi = createLatestWinsThrottle(uiHz, setSignView);
    const commUi = createLatestWinsThrottle(Math.min(10, uiHz + 2), setCommunication);

    const unsubStatus = services.camera.subscribeStatus((status, error) => {
      setCameraStatus(status);
      setCameraError(error);
      if (
        status === "live" &&
        services.controller.current() !== "communicate" &&
        services.perception.getStatus() === "idle" &&
        services.ocr.getStatus() === "idle"
      ) {
        services.echo.start(services.camera);
      } else {
        services.echo.stop();
      }
    });
    const unsubTracks = services.bus.subscribe((event) => {
      if (event.type === "tracks") {
        tracksUi.push(event.objects);
      }
    });
    const unsubResults = services.perception.subscribeResults((result) => {
      detectionUi.push(result);
      services.navigation.ingest(result);
    });
    const unsubPerception = services.perception.subscribeStatus((status) => {
      setPerceptionStatus(status);
      setPerceptionUnavailableReason(services.perception.getUnavailableReason());
    });
    const unsubLoop = services.perception.subscribeLoop((state) => {
      loopUi.push(state);
    });
    const unsubOcrStatus = services.ocr.subscribeStatus((status) => {
      setOcrStatus(status);
      setOcrUnavailableReason(services.ocr.getUnavailableReason());
    });
    const unsubOcrResults = services.ocr.subscribeResults((result) => {
      ocrUi.push(result);
    });
    const unsubNavStatus = services.navigation.subscribeStatus(setNavigationStatus);
    const unsubNavState = services.navigation.subscribeState((state) => {
      pathUi.push({
        obstacles: state.obstacles,
        instruction: state.nextInstruction,
      });
    });
    const unsubSignStatus = services.sign.subscribeStatus((status) => {
      setSignStatus(status);
      if (status !== "live") {
        signUi.flush();
      }
    });
    const unsubSignView = services.sign.subscribeView((view) => {
      signUi.push(view, view.status !== "live");
    });
    const unsubTurns = services.sign.getSession().subscribe((snapshot) => {
      commUi.push(snapshot);
    });
    return () => {
      tracksUi.cancel();
      detectionUi.cancel();
      loopUi.cancel();
      ocrUi.cancel();
      pathUi.cancel();
      signUi.cancel();
      commUi.cancel();
      unsubStatus();
      unsubTracks();
      unsubResults();
      unsubPerception();
      unsubLoop();
      unsubOcrStatus();
      unsubOcrResults();
      unsubNavStatus();
      unsubNavState();
      unsubSignStatus();
      unsubSignView();
      unsubTurns();
      services.echo.stop();
      services.stt.stop();
      services.navigation.stop();
      void services.sign.stop();
      void services.ocr.stop();
      void services.perception.stop();
      void services.camera.stop();
    };
  }, [deviceProfile.uiHz, services]);

  const updatePrefs = useCallback(
    async (patch: Partial<UserPrefs>) => {
      if (!prefs) {
        return;
      }
      const next = { ...prefs, ...patch };
      if (patch.speechRate !== undefined) {
        next.speechRate = clampSpeechRate(patch.speechRate);
      }
      if (patch.ocrEmptyAnnounceMs !== undefined) {
        next.ocrEmptyAnnounceMs = clampOcrEmptyAnnounceMs(patch.ocrEmptyAnnounceMs);
      }
      if (patch.speechInLocale !== undefined) {
        next.speechInLocale = sanitizeSpeechInLocale(patch.speechInLocale);
      }
      if (patch.speechVolume !== undefined) {
        next.speechVolume = clampSpeechVolume(patch.speechVolume);
      }
      if (patch.detectionSensitivity !== undefined) {
        next.detectionSensitivity = clampDetectionSensitivity(patch.detectionSensitivity);
      }
      setPrefs(next);
      services.setPrefsSnapshot(next);
      await services.prefsStore.set(patch);

      if (
        services.camera.getStatus() === "live" &&
        (patch.preferredCameraDeviceId !== undefined ||
          patch.preferredCameraFacingAssist !== undefined)
      ) {
        const mode = services.controller.current();
        if (mode === "assist" || mode === "communicate") {
          void services.camera.reconfigure(
            cameraRequestWithPrefs(
              mode === "communicate" ? "communicate" : "assist",
              deviceProfile,
              next,
            ),
          );
        }
      }
    },
    [deviceProfile, prefs, services],
  );

  useEffect(() => {
    if (!prefs) {
      return;
    }
    services.setPrefsSnapshot(prefs);
  }, [prefs, services]);

  useEffect(() => {
    if (!prefs) {
      return;
    }
    if (perceptionStatus === "live" || perceptionStatus === "paused") {
      services.perception.setDeviceClass(deviceProfile.class);
      services.perception.setProfile(prefs.performanceProfile);
      services.perception.setBackgroundWarnings(prefs.backgroundWarnings);
      services.perception.setSpeakingSafety(() => services.speech.isSpeakingSafety());
      services.perception.setOcrEnabled(prefs.ocrEnabled);
    }
    services.camera.setKeepCaptureInBackground(prefs.backgroundWarnings);
    if (ocrStatus === "live" || ocrStatus === "paused") {
      services.ocr.setBackgroundWarnings(prefs.backgroundWarnings);
      services.ocr.setShouldPause(
        () =>
          (services.perception.getStatus() === "live" ||
            services.perception.getStatus() === "paused") &&
          services.speech.isSpeakingSafety(),
      );
    }
  }, [deviceProfile.class, ocrStatus, perceptionStatus, prefs, services]);

  const emit = useCallback(
    (event: RuntimeEvent) => {
      services.bus.emit(event);
    },
    [services],
  );

  const enterMode = useCallback(
    async (next: Exclude<Mode, "idle">) => {
      const previous = services.controller.current();
      if (previous === "assist" && next === "communicate") {
        services.speech.setPathAssistanceActive(false);
        services.navigation.stop();
        services.speech.cancel("nav");
        await services.ocr.stop();
        services.speech.resetOcr();
        await services.perception.stop();
        services.speech.resetScene();
        services.speech.cancel("hazard");
        services.speech.cancel("safety");
        services.speech.cancel("scene");
        services.speech.cancel("nav");
      }
      if (previous === "communicate" && next === "assist") {
        services.speech.cancel("sign");
        services.stt.stop();
        await services.sign.stop();
        services.sign.getSession().reset();
      }
      await services.controller.enter(next);
    },
    [services],
  );

  const startVision = useCallback(async (opts?: { skipNavigate?: boolean }) => {
    if (!capabilities?.available.camera) {
      emit({
        type: "feature-unavailable",
        feature: "camera",
        reason: "Vision assistance is unavailable. No camera was found on this device.",
      });
      return;
    }

    await enterMode("assist");
    if (!opts?.skipNavigate) {
      navigate("/vision");
    }
    if (!prefs) {
      return;
    }
    const requestOptions = cameraRequestWithPrefs("assist", deviceProfile, prefs);
    const cameraAlreadyLive = services.camera.getStatus() === "live";
    services.speech.announceSystem(
      cameraAlreadyLive
        ? "Continuous vision is on. Using the live camera."
        : "Continuous vision is on. Requesting the rear camera.",
      !cameraAlreadyLive,
    );
    try {
      if (!cameraAlreadyLive) {
        await services.camera.request(requestOptions);
      } else if (services.camera.getOptions()?.facingMode === "user") {
        await services.camera.reconfigure({ facingMode: "environment" });
      }
      if (services.camera.getStatus() === "live") {
        services.echo.stop();
        const backend =
          capabilities?.inferenceBackend === "webgpu" ? "webgpu" : "wasm";
        try {
          await services.perception.start(services.camera, backend, {
            profile: prefs?.performanceProfile ?? "balanced",
            backgroundWarnings: prefs?.backgroundWarnings ?? false,
            isSpeakingSafety: () => services.speech.isSpeakingSafety(),
            deviceClass: deviceProfile.class,
          });
          const using = services.perception.getLastResult()?.backend ?? backend;
          const profileNote =
            prefs?.performanceProfile === "power-save"
              ? ", power-save profile"
              : "";
          services.speech.announceSystem(
            `Camera is live. Continuous object detection is on, using ${using}${profileNote}.`,
            false,
          );
        } catch {
          /* feature-unavailable is announced by SpeechManager */
        }
      }
    } catch {
      const cameraError = services.camera.getLastError();
      if (cameraError) {
        services.speech.announceSystem(
          `${cameraError.message} ${cameraError.recovery}`,
          true,
        );
      }
    }
  }, [capabilities, deviceProfile, emit, enterMode, navigate, prefs, services]);

  const startReading = useCallback(async () => {
    if (!prefs?.ocrEnabled) {
      emit({
        type: "feature-unavailable",
        feature: "ocr",
        reason: "Reading is turned off in Settings.",
      });
      return;
    }
    if (!capabilities?.available.camera) {
      emit({
        type: "feature-unavailable",
        feature: "camera",
        reason: "Reading is unavailable. No camera was found on this device.",
      });
      return;
    }
    const assets = await probeOcrAssets();
    setOcrAssetsOk(assets.ok);
    setOcrAssetsReason(assets.reason);
    if (!assets.ok) {
      emit({
        type: "feature-unavailable",
        feature: "ocr",
        reason: assets.reason ?? OCR_ASSETS_MISSING_REASON,
      });
      return;
    }
    if (
      services.ocr.getStatus() === "live" ||
      services.ocr.getStatus() === "loading" ||
      services.ocr.getStatus() === "paused"
    ) {
      return;
    }

    await enterMode("assist");
    navigate("/read");
    if (!prefs) {
      return;
    }
    const requestOptions = cameraRequestWithPrefs("assist", deviceProfile, prefs);
    const cameraAlreadyLive = services.camera.getStatus() === "live";
    services.speech.announceSystem(
      cameraAlreadyLive
        ? "Reading is on. Using the live camera."
        : "Reading is on. Requesting the rear camera.",
      !cameraAlreadyLive,
    );
    try {
      if (!cameraAlreadyLive) {
        await services.camera.request(requestOptions);
      } else if (services.camera.getOptions()?.facingMode === "user") {
        await services.camera.reconfigure({ facingMode: "environment" });
      }
      if (services.camera.getStatus() === "live") {
        services.echo.stop();
        const fps =
          prefs.performanceProfile === "power-save"
            ? Math.min(1, deviceProfile.ocrFps)
            : deviceProfile.ocrFps;
        try {
          await services.ocr.start(services.camera, {
            language: prefs.language,
            fps,
            backgroundWarnings: prefs.backgroundWarnings,
            shouldPause: () =>
              (services.perception.getStatus() === "live" ||
                services.perception.getStatus() === "paused") &&
              services.speech.isSpeakingSafety(),
          });
          services.speech.announceSystem(
            "Continuous reading is on, using Tesseract, about one or two reads per second. English only. This is slower than object detection.",
            false,
          );
        } catch {
          /* feature-unavailable is announced by SpeechManager */
        }
      }
    } catch {
      const cameraError = services.camera.getLastError();
      if (cameraError) {
        services.speech.announceSystem(
          `${cameraError.message} ${cameraError.recovery}`,
          true,
        );
      }
    }
  }, [capabilities, deviceProfile, emit, enterMode, navigate, prefs, services]);

  const stopReading = useCallback(async () => {
    services.speech.cancel("user");
    services.speech.resetOcr();
    await services.ocr.stop();
    setOcrResult(null);
    const visionOn =
      services.perception.getStatus() === "live" ||
      services.perception.getStatus() === "paused" ||
      services.perception.getStatus() === "loading";
    if (!visionOn) {
      if (services.camera.getStatus() === "live") {
        await services.camera.stop();
      }
      await services.controller.exitToIdle();
    }
    services.speech.announceSystem("Reading is off.", false);
  }, [services]);

  const startNavigation = useCallback(async () => {
    if (!capabilities?.available.camera) {
      emit({
        type: "feature-unavailable",
        feature: "navigation",
        reason: PATH_ASSISTANCE_NEEDS_CAMERA,
      });
      return;
    }

    if (services.navigation.isActive()) {
      services.speech.announceSystem("Path assistance is already on.", false);
      return;
    }

    await enterMode("assist");
    navigate("/navigate");

    const visionOn = !navigationNeedsVisionStart(services.perception.getStatus());
    if (!visionOn) {
      await startVision({ skipNavigate: true });
    }

    if (!visionIsReadyForNavigation(services.perception.getStatus())) {
      emit({
        type: "feature-unavailable",
        feature: "navigation",
        reason: PATH_ASSISTANCE_NEEDS_VISION,
      });
      return;
    }

    services.navigation.start();
    services.speech.setPathAssistanceActive(true);
    services.speech.announceSystem(PATH_ASSISTANCE_START_SPEECH, false);
  }, [capabilities, emit, enterMode, navigate, services, startVision]);

  const testSignSpeechOutput = useCallback(() => {
    services.speech.testSignSpeechOutput();
  }, [services]);

  const stopNavigation = useCallback(async () => {
    if (!services.navigation.isActive()) {
      services.speech.announceSystem("Path assistance is not running.", false);
      return;
    }
    services.speech.setPathAssistanceActive(false);
    services.speech.cancel("nav");
    services.navigation.stop();
    setPathObstacles([]);
    setPathInstruction("");
    services.speech.announceSystem(PATH_ASSISTANCE_STOP_SPEECH, false);
  }, [services]);

  const startCommunicate = useCallback(async () => {
    if (!capabilities?.available.camera) {
      emit({
        type: "feature-unavailable",
        feature: "camera",
        reason:
          "Sign-language communication is unavailable. No camera was found on this device.",
      });
      return;
    }

    if (services.stt.getSink() === "assist-commands") {
      services.stt.stop();
      setLastHeardCommand(null);
      setLastHeardTranscript("");
    }

    if (
      services.controller.current() === "communicate" &&
      (services.sign.getStatus() === "live" || services.sign.getStatus() === "loading")
    ) {
      navigate("/sign");
      return;
    }

    await enterMode("communicate");
    navigate("/sign");
    if (!prefs) {
      return;
    }
    const requestOptions = cameraRequestWithPrefs("communicate", deviceProfile, prefs);
    services.speech.primeAudio();
    services.speech.announceSystem(
      "Communication mode is on. Requesting the front camera for isolated signs.",
      true,
    );
    try {
      await services.camera.request(requestOptions);
      if (services.camera.getStatus() === "live") {
        services.echo.stop();
        services.speech.announceSystem(
          "Camera is live. Experimental isolated-sign mode. This is not sentence translation.",
          false,
        );
        try {
          await services.sign.start(services.camera, prefs?.signPackId ?? "asl", {
            landmarkFps: deviceProfile.signFps,
          });
        } catch {
          /* feature-unavailable is announced by SpeechManager */
        }
      }
    } catch {
      const cameraError = services.camera.getLastError();
      if (cameraError) {
        services.speech.announceSystem(
          `${cameraError.message} ${cameraError.recovery}`,
          true,
        );
      }
    }
  }, [capabilities, deviceProfile, emit, enterMode, navigate, prefs, services]);

  const stopSignerChannel = useCallback(async () => {
    services.speech.cancel("sign");
    await services.sign.stop();
    if (services.camera.getStatus() === "live") {
      await services.camera.stop();
    }
    services.speech.announceSystem(
      "Signer camera is off. Partner captions stay available if listening is on.",
      false,
    );
  }, [services]);

  const startSpeakerListening = useCallback(async () => {
    if (services.stt.getSink() === "assist-commands") {
      services.stt.stop();
      setLastHeardCommand(null);
      setLastHeardTranscript("");
    }

    await enterMode("communicate");
    navigate("/sign");

    if (services.stt.getEngine() === "unavailable") {
      setVoiceStatus("unavailable");
      services.speech.announceSystem(partnerSpeechDisclosure("unavailable"), false);
      return;
    }

    const already =
      services.stt.getSink() === "communication" &&
      (services.stt.getStatus() === "listening" || services.stt.getStatus() === "paused");
    if (already) {
      return;
    }

    await services.stt.start("communication");
    const next = services.stt.getStatus();
    if (next === "listening") {
      services.speech.announceSystem(
        "Listening for the speaking partner. Speech appears as large text. Assist commands are off.",
        false,
      );
      return;
    }
    if (next === "denied") {
      services.speech.announceSystem(
        "Microphone permission was denied. Partner captions are off. Buttons still work.",
        true,
      );
      return;
    }
    services.speech.announceSystem(partnerSpeechDisclosure("unavailable"), false);
  }, [enterMode, navigate, services]);

  const stopSpeakerListening = useCallback(async () => {
    services.stt.stop();
    services.speech.announceSystem("Partner listening is off.", false);
  }, [services]);

  const stop = useCallback(async () => {
    services.speech.setPathAssistanceActive(false);
    services.echo.stop();
    services.stt.stop();
    await services.sign.stop();
    services.sign.getSession().reset();
    await teardownContinuousVision({
      cancelSpeech: () => services.speech.cancel(),
      resetScene: () => {
        services.speech.resetScene();
        services.speech.resetOcr();
      },
      stopOcr: () => services.ocr.stop(),
      stopNavigation: () => {
        services.navigation.stop();
      },
      stopPerception: () => services.perception.stop(),
      stopCamera: () => services.camera.stop(),
    });
    setTracks([]);
    setDetection(null);
    setVisionLoop(services.perception.getLoopState());
    setOcrResult(null);
    setPathObstacles([]);
    setPathInstruction("");
    await services.controller.exitToIdle();
    navigate("/");
    services.speech.announceSystem(`Stopped. ${APP_NAME} is idle. The camera is off.`, true);
  }, [navigate, services]);

  useEffect(() => {
    services.setCommandDispatcher((command) => {
      applyAssistCommand(command, {
        startVision: () => {
          void startVision();
        },
        stop: () => {
          void stop();
        },
        startReading: () => {
          void startReading();
        },
        stopReading: () => {
          void stopReading();
        },
        startNavigation: () => {
          void startNavigation();
        },
        stopNavigation: () => {
          void stopNavigation();
        },
      });
    });
  }, [
    services,
    startNavigation,
    startReading,
    startVision,
    stop,
    stopNavigation,
    stopReading,
  ]);

  const toggleVoice = useCallback(async () => {
    const status = services.stt.getStatus();
    if (status === "listening" || status === "paused" || status === "requesting") {
      services.stt.stop();
      services.speech.announceSystem("Voice control is off.", false);
      return;
    }
    if (services.stt.getEngine() === "unavailable") {
      setVoiceStatus("unavailable");
      services.speech.announceSystem(speechInEngineDisclosure("unavailable"), false);
      return;
    }
    const communicate = services.controller.current() === "communicate";
    await services.stt.start(communicate ? "communication" : "assist-commands");
    const next = services.stt.getStatus();
    if (next === "listening") {
      if (communicate) {
        services.speech.announceSystem(
          "Listening for the speaking partner. Speech appears as large text. Assist commands are off.",
          false,
        );
        return;
      }
      const whisperNote =
        prefs?.speechInEnginePreference === "whisper-tiny"
          ? ` Whisper-tiny is not shipped, so ${APP_NAME} is using the Web Speech API instead.`
          : "";
      services.speech.announceSystem(
        `Voice control is listening. ${speechInEngineDisclosure("webspeech")}${whisperNote}`,
        false,
      );
      return;
    }
    if (next === "denied") {
      services.speech.announceSystem(
        "Microphone permission was denied. Voice control is off. Buttons still work.",
        true,
      );
      return;
    }
    services.speech.announceSystem(speechInEngineDisclosure("unavailable"), false);
  }, [prefs, services]);

  const activity = assistActivity({
    mode,
    visionRunning:
      perceptionStatus === "live" ||
      perceptionStatus === "paused" ||
      perceptionStatus === "loading",
    readingRunning:
      ocrStatus === "live" || ocrStatus === "paused" || ocrStatus === "loading",
  });
  const voiceEngine: SttEngine =
    capabilities?.speechInEngine === "webspeech" || services.stt.getEngine() === "webspeech"
      ? "webspeech"
      : "unavailable";

  const sessionValue = useMemo<MaraSessionValue | null>(() => {
    if (!prefs) {
      return null;
    }
    return {
      mode,
      prefs,
      capabilities,
      updatePrefs,
      startVision,
      startReading,
      stopReading,
      startNavigation,
      stopNavigation,
      startCommunicate,
      stopSignerChannel,
      startSpeakerListening,
      stopSpeakerListening,
      testSignSpeechOutput,
      stop,
      voiceStatus,
      voiceEngine,
      lastHeardCommand,
      lastHeardTranscript,
      voiceFailure,
      toggleVoice,
      assistActivity: activity,
      camera: services.camera,
      cameraStatus,
      cameraError,
      perceptionStatus,
      perceptionUnavailableReason,
      ocrStatus,
      ocrAssetsOk,
      ocrAssetsReason,
      ocrUnavailableReason,
      navigationStatus,
      signStatus,
    };
  }, [
    activity,
    capabilities,
    cameraError,
    cameraStatus,
    lastHeardCommand,
    lastHeardTranscript,
    mode,
    navigationStatus,
    ocrAssetsOk,
    ocrAssetsReason,
    ocrStatus,
    ocrUnavailableReason,
    perceptionStatus,
    perceptionUnavailableReason,
    prefs,
    signStatus,
    startCommunicate,
    startNavigation,
    startReading,
    startSpeakerListening,
    startVision,
    stop,
    stopNavigation,
    stopReading,
    stopSignerChannel,
    stopSpeakerListening,
    testSignSpeechOutput,
    toggleVoice,
    updatePrefs,
    voiceEngine,
    voiceFailure,
    voiceStatus,
    services.camera,
  ]);

  const speechUiValue = useMemo<MaraSpeechUiValue>(
    () => ({
      lastAnnouncement,
      assertiveMessage,
      politeMessage,
      assertiveNonce,
      politeNonce,
    }),
    [assertiveMessage, assertiveNonce, lastAnnouncement, politeMessage, politeNonce],
  );

  const perceptionUiValue = useMemo<MaraPerceptionUiValue>(
    () => ({
      tracks,
      detection,
      visionLoop,
      ocrResult,
      pathObstacles,
      pathInstruction,
    }),
    [detection, ocrResult, pathInstruction, pathObstacles, tracks, visionLoop],
  );

  const communicateUiValue = useMemo<MaraCommunicateUiValue>(
    () => ({
      signView,
      communication,
    }),
    [communication, signView],
  );

  if (!sessionValue) {
    return (
      <div className="min-h-dvh bg-bg px-6 py-10 text-fg">
        <p role="status">Loading {APP_NAME}.</p>
      </div>
    );
  }

  return (
    <MaraSessionContext.Provider value={sessionValue}>
      <MaraSpeechUiContext.Provider value={speechUiValue}>
        <MaraPerceptionUiContext.Provider value={perceptionUiValue}>
          <MaraCommunicateUiContext.Provider value={communicateUiValue}>
            {children}
          </MaraCommunicateUiContext.Provider>
        </MaraPerceptionUiContext.Provider>
      </MaraSpeechUiContext.Provider>
    </MaraSessionContext.Provider>
  );
}

function requireCtx<T>(value: T | null, name: string): T {
  if (!value) {
    throw new Error(`${name} must be used within MaraRuntimeProvider.`);
  }
  return value;
}

export function useMaraSession(): MaraSessionValue {
  return requireCtx(useContext(MaraSessionContext), "useMaraSession");
}

export function useMaraSpeechUi(): MaraSpeechUiValue {
  return requireCtx(useContext(MaraSpeechUiContext), "useMaraSpeechUi");
}

export function useMaraPerceptionUi(): MaraPerceptionUiValue {
  return requireCtx(useContext(MaraPerceptionUiContext), "useMaraPerceptionUi");
}

export function useMaraCommunicateUi(): MaraCommunicateUiValue {
  return requireCtx(useContext(MaraCommunicateUiContext), "useMaraCommunicateUi");
}

export function useMara(): MaraRuntimeValue {
  const session = useMaraSession();
  const speech = useMaraSpeechUi();
  const perception = useMaraPerceptionUi();
  const communicate = useMaraCommunicateUi();
  return { ...session, ...speech, ...perception, ...communicate };
}
