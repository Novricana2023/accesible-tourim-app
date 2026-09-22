import type {
  CommunicationTurn,
  EventBus,
  SignLanguagePackId,
  SignPrediction,
} from "@mara/shared";
import type { CameraService } from "@/modules/camera/CameraService";
import {
  CommunicationSession,
  type PartnerEchoContext,
} from "./CommunicationSession";
import { ConfidenceGate } from "./confidenceGate";
import { listVocabulary, spokenPhraseForGloss } from "./GlossToSpeech";
import { MediaPipeLandmarkExtractor } from "./MediaPipeLandmarkExtractor";
import { HeuristicSignClassifier } from "./HeuristicSignClassifier";
import { OnnxSignClassifier } from "./OnnxSignClassifier";
import { UnavailableClassifier } from "./UnavailableClassifier";
import {
  CLASSIFIER_MISSING_REASON,
  CLASSIFY_EVERY,
  EXPERIMENTAL_BANNER,
  LANDMARKS_MISSING_REASON,
  SEQUENCE_FRAMES,
  type LandmarkExtractor,
  type LandmarkFrame,
  type SignClassifier,
  type SignRuntimeStatus,
  type SignUncertainty,
  type SignVocabEntry,
} from "./types";

export interface SignViewState {
  status: SignRuntimeStatus;
  experimentalBanner: string;
  packId: SignLanguagePackId | null;
  packLoaded: boolean;
  classifierReady: boolean;
  landmarksReady: boolean;
  vocabulary: SignVocabEntry[];
  lastGloss: string | null;
  lastSpokenText: string | null;
  confidence: number | null;
  uncertainty: SignUncertainty;
  handsDetected: number;
  reason: string | null;
}

export interface SignLanguageRuntimeDeps {
  bus: EventBus;
  createExtractor?: () => LandmarkExtractor;
  createClassifier?: (packId: SignLanguagePackId) => SignClassifier;
  now?: () => number;
  session?: CommunicationSession;
}

const DEFAULT_VIEW: SignViewState = {
  status: "idle",
  experimentalBanner: EXPERIMENTAL_BANNER,
  packId: null,
  packLoaded: false,
  classifierReady: false,
  landmarksReady: false,
  vocabulary: [],
  lastGloss: null,
  lastSpokenText: null,
  confidence: null,
  uncertainty: "pack-not-loaded",
  handsDetected: 0,
  reason: null,
};

export class SignLanguageRuntime {
  private readonly bus: EventBus;
  private readonly createExtractor: () => LandmarkExtractor;
  private readonly createClassifier: (packId: SignLanguagePackId) => SignClassifier;
  private readonly now: () => number;
  private readonly session: CommunicationSession;
  private readonly gate = new ConfidenceGate();
  private readonly viewListeners = new Set<(view: SignViewState) => void>();
  private readonly statusListeners = new Set<(status: SignRuntimeStatus) => void>();
  private extractor: LandmarkExtractor | null = null;
  private classifier: SignClassifier | null = null;
  private camera: CameraService | null = null;
  private cameraUnsub: (() => void) | null = null;
  private status: SignRuntimeStatus = "idle";
  private view: SignViewState = { ...DEFAULT_VIEW };
  private sequence: LandmarkFrame[] = [];
  private framesSinceClassify = 0;
  private vocabFilter: string[] | "all" = "all";
  private packId: SignLanguagePackId = "asl";

  constructor(deps: SignLanguageRuntimeDeps) {
    this.bus = deps.bus;
    this.createExtractor = deps.createExtractor ?? (() => new MediaPipeLandmarkExtractor());
    this.createClassifier = deps.createClassifier ?? ((packId) => new OnnxSignClassifier(packId));
    this.now = deps.now ?? (() => Date.now());
    this.session = deps.session ?? new CommunicationSession();
  }

  getStatus(): SignRuntimeStatus {
    return this.status;
  }

  getView(): SignViewState {
    return this.view;
  }

  getSession(): CommunicationSession {
    return this.session;
  }

  subscribeView(listener: (view: SignViewState) => void): () => void {
    this.viewListeners.add(listener);
    listener(this.view);
    return () => {
      this.viewListeners.delete(listener);
    };
  }

  subscribeStatus(listener: (status: SignRuntimeStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  setVocabularyFilter(glosses: string[] | "all"): void {
    this.vocabFilter = glosses;
  }

  ingestSpeaker(
    text: string,
    isFinal = true,
    echo?: PartnerEchoContext,
  ): CommunicationTurn | null {
    const turn = this.session.ingestPartnerSpeech(text, {
      isFinal,
      createdMs: this.now(),
      echo,
    });
    if (turn) {
      this.bus.emit({ type: "communication-turn", turn });
    }
    return turn;
  }

  async start(
    camera: CameraService,
    packId: SignLanguagePackId,
    options: { landmarkFps?: number } = {},
  ): Promise<void> {
    await this.stop();
    this.camera = camera;
    this.packId = packId;
    this.gate.reset();
    this.sequence = [];
    this.framesSinceClassify = 0;
    this.setStatus("loading");
    const vocabulary = listVocabulary(packId);
    this.view = {
      ...DEFAULT_VIEW,
      status: "loading",
      packId,
      vocabulary,
      uncertainty: "pack-not-loaded",
      reason: CLASSIFIER_MISSING_REASON,
    };
    this.emitView();

    this.classifier = this.createClassifier(packId);
    const loaded = await this.classifier.load();
    let classifierReady = loaded.ok;
    let classifierNote: string | null = null;
    if (!classifierReady) {
      await this.classifier.dispose();
      if (packId === "asl") {
        this.classifier = new HeuristicSignClassifier();
        const heuristic = await this.classifier.load();
        classifierReady = heuristic.ok;
        classifierNote =
          "Basic hand-shape assist is on (trained ASL weights are not installed). Sign slowly with both hands in frame.";
      } else {
        this.classifier = new UnavailableClassifier();
        this.bus.emit({
          type: "feature-unavailable",
          feature: "sign-classifier",
          reason: loaded.reason,
        });
      }
    }

    let landmarksReady = false;
    let landmarkReason: string | null = null;
    this.extractor = this.createExtractor();
    try {
      await this.extractor.start(
        (frame) => {
          void this.handleLandmarks(frame);
        },
        (reason) => {
          this.view = {
            ...this.view,
            landmarksReady: false,
            reason: reason || LANDMARKS_MISSING_REASON,
          };
          this.emitView();
        },
      );
      landmarksReady = true;
      const landmarkFps = options.landmarkFps ?? 16;
      this.extractor.setTargetFps?.(landmarkFps);
      camera.setCaptureBudget?.("sign", 480);
      if (this.extractor.attachCamera) {
        this.extractor.attachCamera(camera);
      } else if (this.extractor.ingestBitmap) {
        this.attachGenericCamera(camera, landmarkFps);
      }
    } catch (error) {
      landmarkReason =
        error instanceof Error ? error.message : LANDMARKS_MISSING_REASON;
      this.bus.emit({
        type: "feature-unavailable",
        feature: "sign-landmarks",
        reason: landmarkReason,
      });
    }

    this.view = {
      ...this.view,
      status: "live",
      packLoaded: classifierReady,
      classifierReady,
      landmarksReady,
      uncertainty: classifierReady ? "not-recognized" : "pack-not-loaded",
      reason: classifierNote ?? (classifierReady ? landmarkReason : loaded.ok ? landmarkReason : loaded.reason),
    };
    this.setStatus("live");
    this.emitView();
  }

  async stop(): Promise<void> {
    this.cameraUnsub?.();
    this.cameraUnsub = null;
    this.camera?.setCaptureBudget?.("sign", null);
    this.camera = null;
    if (this.extractor) {
      await this.extractor.stop();
      this.extractor = null;
    }
    if (this.classifier) {
      await this.classifier.dispose();
      this.classifier = null;
    }
    this.sequence = [];
    this.gate.reset();
    this.view = { ...DEFAULT_VIEW };
    this.setStatus("idle");
    this.emitView();
  }

  async handleLandmarks(frame: LandmarkFrame): Promise<void> {
    if (this.status !== "live") {
      return;
    }
    this.sequence.push(frame);
    if (this.sequence.length > SEQUENCE_FRAMES) {
      this.sequence.shift();
    }
    this.view = {
      ...this.view,
      handsDetected: frame.hands.length,
    };
    this.framesSinceClassify += 1;
    if (!this.view.classifierReady || !this.classifier) {
      this.emitView();
      return;
    }
    if (this.framesSinceClassify < CLASSIFY_EVERY) {
      this.emitView();
      return;
    }
    this.framesSinceClassify = 0;
    const result = await this.classifier.predict(this.sequence);
    if (!this.allowedGloss(result?.gloss)) {
      this.applyDecision(
        this.gate.decide(
          result ? { gloss: result.gloss, confidence: 0 } : null,
          frame.timestampMs,
        ),
        frame.timestampMs,
      );
      return;
    }
    this.applyDecision(this.gate.decide(result, frame.timestampMs), frame.timestampMs);
  }

  private allowedGloss(gloss: string | undefined): boolean {
    if (!gloss) {
      return false;
    }
    const normalized = gloss.trim().toUpperCase();
    if (this.vocabFilter !== "all" && !this.vocabFilter.includes(normalized)) {
      return false;
    }
    return spokenPhraseForGloss(this.packId, normalized) !== null;
  }

  private applyDecision(
    decision: ReturnType<ConfidenceGate["decide"]>,
    now: number,
  ): void {
    const spoken = decision.gloss
      ? spokenPhraseForGloss(this.packId, decision.gloss)
      : null;
    this.view = {
      ...this.view,
      lastGloss: decision.gloss,
      lastSpokenText: decision.speak ? spoken : this.view.lastSpokenText,
      confidence: decision.confidence,
      uncertainty: decision.uncertainty,
    };

    if (decision.speak && decision.gloss && spoken) {
      const prediction: SignPrediction = {
        packId: this.packId,
        gloss: decision.gloss,
        spokenText: spoken,
        confidence: decision.confidence ?? 0,
        kind: "isolated",
        startedMs: now,
        endedMs: now,
      };
      this.bus.emit({ type: "sign", prediction });
      const turn = this.session.addSigner(spoken, now);
      if (turn) {
        this.bus.emit({ type: "communication-turn", turn });
      }
    }
    this.emitView();
  }

  private attachGenericCamera(camera: CameraService, fps: number): void {
    this.cameraUnsub?.();
    this.cameraUnsub = camera.subscribe("sign-language", fps, (frame) => {
      if (!this.extractor?.ingestBitmap) {
        try {
          frame.bitmap.close();
        } catch {
          /* ignore */
        }
        return;
      }
      void this.extractor.ingestBitmap(frame.bitmap, frame.frameId, frame.timestampMs);
    });
  }

  private setStatus(status: SignRuntimeStatus): void {
    this.status = status;
    this.view = { ...this.view, status };
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private emitView(): void {
    for (const listener of this.viewListeners) {
      listener(this.view);
    }
  }
}
