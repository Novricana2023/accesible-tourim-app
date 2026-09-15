# Mara — Production Architecture

Mara is a camera-first accessibility web application for blind and visually impaired users, with a separately isolated communication mode for sign-language users. This document is the source of truth for what we will build, what we will not pretend to build, and how work is split into independently testable phases.

**Status:** architecture only. No runtime features are implemented yet.

**Non-negotiable:** every perception, speech, and navigation output must come from a real model, a real browser API, or a real backend service. If a capability cannot meet its acceptance criteria, it stays disabled and is announced as unavailable. No mocked detections, no canned spoken scenes, no placeholder “AI” buttons.

---

## 1. Architecture analysis

### 1.1 Product modes

Mara has two exclusive operating modes. They share auth, preferences, speech I/O, and the camera *device*, but they do not share an inference graph.

| Mode | Primary user | Camera job | Speech job |
| --- | --- | --- | --- |
| **Assist** | Blind / low-vision | Continuous scene understanding | Spoken warnings, OCR, navigation |
| **Communicate** | Deaf / hard-of-hearing signer and a speaking partner | Hands / pose / face landmarks only | Sign gloss to speech; partner speech to large text |

Reasons they are exclusive:

- A phone cannot run YOLO, OCR, and MediaPipe Holistic at useful frame rates at the same time.
- Sign recognition needs a tighter crop, higher landmark rate, and different failure UX than obstacle detection.
- Mixing outputs into one speech queue would bury hazards or bury signs.

Mode switches tear down the inactive runtime and release its workers. The camera `MediaStream` is owned by a single `CameraService` and reconfigured (resolution, frame rate, facing mode) for the new runtime.

### 1.2 Runtime topology

```
                    ┌─────────────────────────────────────────┐
                    │  React UI (Assist / Communicate shells) │
                    │  WCAG 2.2, Radix/shadcn, aria-live      │
                    └──────────────────┬──────────────────────┘
                                       │ typed events only
                    ┌──────────────────▼──────────────────────┐
                    │  App Runtime (main thread, no ML)       │
                    │  CameraService · ModeController · Bus   │
                    │  SpeechBridge · SpeechPriorityQueue     │
                    │  PrefsStore                             │
                    └───────┬───────────────────┬─────────────┘
           Assist           │                   │          Communicate
    ┌───────────────────────▼────────┐ ┌────────▼──────────────────────┐
    │ Perception Runtime (workers)   │ │ Sign Language Runtime         │
    │  YOLO ONNX · tracker · OCR     │ │  MediaPipe Holistic           │
    │  spatial estimator · warnings  │ │  isolated-sign ONNX           │
    └───────────────┬────────────────┘ │  fingerspell decoder          │
                    │                  └────────┬──────────────────────┘
                    │                           │
                    └──────────┬────────────────┘
                               │ HTTPS, never raw video
                    ┌──────────▼──────────┐
                    │ FastAPI             │
                    │ routing proxy       │
                    │ optional doc OCR    │
                    │ model manifest      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Supabase            │
                    │ auth, prefs, places │
                    └─────────────────────┘
```

**Main thread does not run neural nets.** Workers own ONNX Runtime Web and MediaPipe. The UI only renders and speaks from typed events.

### 1.3 Stack choices (and why)

| Layer | Choice | Why |
| --- | --- | --- |
| Web app | React + TypeScript + Vite | Fast iteration, strict types for perception events, mature a11y tooling |
| CSS | Tailwind + accessible primitives (Radix / shadcn) | Focus, keyboard, and live-region patterns we will not reinvent |
| Local detection | Default: YOLO11n (Ultralytics) exported to ONNX; YOLO11s if the device budget allows | Best latency/accuracy we can ship in-browser. **License is AGPL-3.0** unless we buy a commercial grant or swap to a permissively licensed detector before distribution |
| Local runtime | ONNX Runtime Web, WebGPU first, WASM fallback | Production inference path; no Python in the browser |
| Hands / pose | MediaPipe Holistic / Hands, in the sign module only | Landmark extraction is solved; full SL translation is not |
| OCR | PP-OCRv4 ONNX (DBNet detect + recognition) in a worker, via RapidOCR bindings if they stay the thinnest loader; Tesseract.js only as on-demand fallback | Continuous Tesseract.js is too slow to be honest |
| Speech out | `speechSynthesis` + mirrored `aria-live` | Lowest latency; works with OS voices; screen-reader coexistence |
| Speech in | Web Speech API where present; Whisper-tiny (Transformers.js) as offline fallback | Must disclose that Chrome recognition is a Google network service |
| Navigation | FastAPI proxy to OpenRouteService / OSRM + Geolocation + DeviceOrientation | Keys stay off the client; spoken turn-by-turn is the primary UI |
| Auth / persistence | Supabase | Auth, encrypted prefs, saved places. Never video frames |
| Backend | FastAPI + Python | Thin: routing, model manifest, optional heavy document OCR, health |

### 1.4 Design principles

1. **Local first for anything that touches a live camera.** Frames never leave the device unless the user explicitly submits a still for document OCR.
2. **Adaptive, not maximum, frame rate.** Target a stable latency budget, not 30 FPS of every model.
3. **Capability detection, then disable.** If WebGPU, camera, or SpeechRecognition is missing, Mara announces the gap and turns the feature off.
4. **Screen readers are first-class.** App TTS is optional and must not fight NVDA, JAWS, or VoiceOver.
5. **Closed claims.** Assist can say “person, left, near.” It cannot claim metric distance. Communicate can emit a gloss from a closed vocabulary. It cannot claim full ASL/SASL/BSL translation in v1.

### 1.5 Brief capability coverage

Every numbered capability in the product brief maps to a real engine. If that engine is not ready, the capability is off — not stubbed.

| # | Capability | Owner | Honest v1 behavior |
| --- | --- | --- | --- |
| 1 | Continuous object detection | `PerceptionRuntime` + YOLO ONNX worker | Adaptive FPS, Assist only |
| 2 | Spoken environmental warnings | `warnings.ts` → `SpeechBridge` → queue | Deterministic templates, cooldown, no LLM |
| 3 | Position / direction | `spatial.ts` + tracker history | `left/center/right`, `near/mid/far`, motion hint. No meters |
| 4 | Continuous OCR / text reading | `ocr.worker` + `readNow()` | Detect at 1–2 Hz; recognize new or stable regions only |
| 5 | Speech-to-text | `SttAdapter` → `AssistCommandParser` | Closed command set in Assist; engine disclosed |
| 6 | Text-to-speech | `TtsAdapter` + `aria-live` | Priority queue; screen-reader coexistence |
| 7 | Navigation assistance | `NavigationService` + FastAPI proxy | Outdoor pedestrian routing only |
| 8 | Sign-language recognition | `SignLanguageRuntime` | Closed vocabulary after the accuracy gate |
| 9 | Sign-language-to-speech | `GlossToSpeech` + `CommunicationSession` | Mapped phrase only; unknown gloss is silent |
| 10 | Speech-to-text for a signing user | `SttAdapter` → `CommunicationSession` only | Partner speech as large text; no paraphrase |

Communicate does not run Assist perception. A signer in Communicate mode does not receive environmental hazard speech. That is an exclusive-mode cost, not a hidden fallback.

---

## 2. Technical limitations (honest)

These are product constraints, not temporary TODOs.

| Limitation | Consequence |
| --- | --- |
| Monocular phone/webcam has no reliable metric depth | Position is `left / center / right` plus `near / mid / far` from bounding-box geometry. Meters are not a v1 output. |
| COCO-80 misses accessibility-critical classes | Stairs, curbs, poles, potholes, doors, cane, wheelchair require a **custom fine-tune**. Phase 2 ships COCO; Phase 2b ships the access-class model. |
| A mid-range phone cannot run YOLO + OCR + Holistic together | Assist and Communicate are exclusive. Inside Assist, OCR is 1–2 Hz and skipped when a hazard is active. |
| Chrome `SpeechRecognition` is a Google cloud service | Offline/Firefox path is Whisper-tiny. The UI must say which engine is live. |
| `speechSynthesis` voice quality and language coverage vary by OS | Acceptable for v1. Neural TTS is a later optional backend, never a fake voice. |
| Continuous scene OCR is hard | We detect text regions often and recognize only new/stable regions. “Read everything always” is not a real-time feature. |
| Full continuous sign-language translation is research-grade | v1 is isolated signs (closed vocab) plus fingerspelling. We will not ship a “translator” label. |
| Public SL datasets are language-specific and sparse | Architecture is language-pack based (`asl`, later `sasl`, `bsl`). A pack that is not trained does not load. |
| Indoor GNSS is poor | Indoor turn-by-turn is out of scope without a dedicated indoor map provider. |
| iOS Safari: WebGPU incomplete, SpeechRecognition weak, camera quirks | Assist degrades to WASM and lower FPS; Communicate may be Android/desktop-first until Safari is measured. |
| Battery and thermal throttling | Adaptive scheduler drops OCR, then detection FPS, then announces “power save.” |
| HTTPS + permission gates | Camera, mic, geolocation, and device orientation all require secure context and explicit user grant. |
| App TTS vs screen reader | Default: prefer `aria-live` when a screen reader is detected; `speechSynthesis` is an explicit setting. |
| Ultralytics YOLO is AGPL-3.0 | Shipping Mara as a closed binary without a commercial Ultralytics license, or without open-sourcing the corresponding code, is not compliant. Phase 2 must record the chosen license path before public distribution. |
| Isolated-sign packs need a redistributable dataset | A WLASL-derived pack ships only if the license and the held-out clips we use for the gate allow it. No pack, no Communicate UI. |

---

## 3. What runs locally in the browser

| Component | Engine | Target rate | Notes |
| --- | --- | --- | --- |
| Camera capture | `getUserMedia` | 15–30 Hz capture | Single `MediaStream` owner |
| Frame distribution | `FrameBus` + `OffscreenCanvas` | Adaptive | Workers receive transferable frames |
| Object detection | YOLO-n/s ONNX via ORT-Web | 8–15 Hz desktop WebGPU; 4–8 Hz WASM/mobile | Assist only |
| Object tracking | IoU + BYTETrack-lite | Same as detection | Stable IDs for speech dedupe |
| Spatial + motion | Pure geometry on boxes + short track history | Per detection | Zone, depth band, motion hint. No depth model in v1 |
| Environmental warnings | Rule engine on tracks | Event-driven | Cooldown + zone hysteresis |
| Scene text detection | PP-OCRv4 det (DBNet) ONNX | 1–2 Hz | Skipped during priority-0/1 speech |
| Scene text recognition | PP-OCRv4 rec ONNX | On new/stable regions | Not every frame |
| On-demand block OCR | Tesseract.js or same ONNX rec | User-initiated | Real, just slow; announce “reading” |
| Hand / pose / face landmarks | MediaPipe Holistic | 20–30 Hz | Communicate only |
| Isolated sign classification | Small ONNX on landmark sequences | Sliding window ~2–4 Hz decisions | Closed vocabulary |
| Fingerspelling | Letter HMM / CTC on landmarks | Continuous in Communicate | Separate from isolated signs |
| TTS | `speechSynthesis` | Event-driven | Priority queue |
| STT (online) | Web Speech API | Utterance | Disclose network |
| STT (offline) | Whisper-tiny Transformers.js | Utterance | Higher latency |
| Heading | `DeviceOrientationEvent` / AbsoluteOrientation | ~10 Hz | Outdoor nav |
| Location | Geolocation watch | 1 Hz | Outdoor nav |
| Prefs cache | IndexedDB | n/a | Offline-first prefs |

Optional later, still local if it fits the budget: monocular depth (Depth Anything-S) at 2 Hz to improve near/far. Not in the first Assist slice.

---

## 4. What requires a backend

The backend never receives a live video stream.

| Component | Why it is not local | Service |
| --- | --- | --- |
| Auth, sessions, device list | Identity and recovery | Supabase Auth |
| Accessibility preferences sync | Multi-device | Supabase Postgres + RLS |
| Saved places, home/work | Persistence | Supabase |
| Pedestrian routing, geocoding, map tiles | Large graph + API keys | FastAPI proxy → OpenRouteService / OSRM / MapLibre tiles |
| Model manifest and signed downloads | Versioned ONNX / language packs | FastAPI + object storage (or Supabase Storage) |
| Optional document OCR | Dense pages exceed browser budget | FastAPI + PaddleOCR, user-submitted still only |
| Feature flags / kill switch | Safety | FastAPI |
| Opt-in telemetry | Crash + latency only, no frames | FastAPI or Supabase |
| Sign-language pack training pipeline | Offline job, not request path | Separate Python jobs; not a runtime API that “translates video” |

FastAPI is intentionally thin. If a feature can run in a worker, it does.

---

## 5. Module interfaces

All cross-module traffic is typed. Modules never import each other’s internals. Events are the contract.

### 5.1 Shared types (`packages/shared`)

```ts
export type Mode = "assist" | "communicate" | "idle";

export type Capability =
  | "webgpu"
  | "wasm-simd"
  | "camera"
  | "mic"
  | "speech-recognition"
  | "speech-synthesis"
  | "geolocation"
  | "orientation";

export interface CapabilityReport {
  available: Record<Capability, boolean>;
  inferenceBackend: "webgpu" | "wasm" | "unavailable";
  speechInEngine: "webspeech" | "whisper-tiny" | "unavailable";
  notes: string[];
}

export interface CameraFrame {
  frameId: number;
  timestampMs: number;
  width: number;
  height: number;
  // Transferred to workers; never structured-cloned as a giant pixel array on the main thread
  bitmap: ImageBitmap;
}

export type HorizontalZone = "left" | "center" | "right";
export type DepthBand = "near" | "mid" | "far";
export type MotionHint = "approaching" | "receding" | "crossing" | "stationary" | "unknown";
// MotionHint is box-history geometry (area + centroid), not metric velocity.

export interface DetectedObject {
  trackId: string;
  label: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number }; // normalized 0–1
  zone: HorizontalZone;
  depth: DepthBand;
  motion: MotionHint;
  firstSeenMs: number;
  lastSeenMs: number;
}

export type WarningSeverity = 0 | 1 | 2; // 0 interrupt hazard, 1 safety, 2 advisory

export interface WarningEvent {
  id: string;
  trackId: string;
  severity: WarningSeverity;
  code: "obstacle-near" | "obstacle-approaching" | "crossing-path" | "lost-track";
  label: string;
  zone: HorizontalZone;
  depth: DepthBand;
  utterance: string;
  createdMs: number;
}

export interface OcrRegion {
  id: string;
  box: { x: number; y: number; w: number; h: number };
  text: string;
  confidence: number;
  stableFrames: number;
}

export interface OcrResult {
  frameId: number;
  regions: OcrRegion[];
  source: "onnx-continuous" | "onnx-demand" | "tesseract-demand" | "backend-document";
}

export type SpeechPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6;
// 0 hazard interrupt
// 1 safety
// 2 user-initiated (read now, where am I)
// 3 navigation maneuver
// 4 new scene object
// 5 sign gloss / communication
// 6 system status

export interface SpeechRequest {
  id: string;
  priority: SpeechPriority;
  text: string;
  interrupt: boolean;
  category: "hazard" | "safety" | "user" | "nav" | "scene" | "sign" | "system";
  dedupeKey: string;
  cooldownMs: number;
  createdMs: number;
}

export interface NavigationState {
  active: boolean;
  destinationLabel: string;
  nextInstruction: string;
  distanceMetersToStep: number | null; // from routing API, not from camera
  bearingDegrees: number | null;
  rerouteRequired: boolean;
}

export type SignLanguagePackId = "asl" | "sasl" | "bsl";

export interface SignPrediction {
  packId: SignLanguagePackId;
  gloss: string;
  spokenText: string;
  confidence: number;
  kind: "isolated" | "fingerspell";
  startedMs: number;
  endedMs: number;
}

export interface CommunicationTurn {
  id: string;
  from: "signer" | "speaker";
  text: string;
  createdMs: number;
}

export type AssistCommandName =
  | "read-now"
  | "describe-scene"
  | "stop-speech"
  | "mute-scene"
  | "unmute-scene"
  | "where-am-i";

export interface AssistCommand {
  name: AssistCommandName;
  rawTranscript: string;
  confidence: number;
}

export type RuntimeEvent =
  | { type: "capabilities"; report: CapabilityReport }
  | { type: "tracks"; objects: DetectedObject[] }
  | { type: "warning"; warning: WarningEvent }
  | { type: "ocr"; result: OcrResult }
  | { type: "speech-request"; request: SpeechRequest }
  | { type: "speech-started"; id: string }
  | { type: "speech-ended"; id: string }
  | { type: "navigation"; state: NavigationState }
  | { type: "sign"; prediction: SignPrediction }
  | { type: "communication-turn"; turn: CommunicationTurn }
  | { type: "assist-command"; command: AssistCommand }
  | { type: "feature-unavailable"; feature: string; reason: string };

export interface UserPrefs {
  ttsMode: "aria-live" | "speechSynthesis" | "both";
  mutedCategories: Array<SpeechRequest["category"]>;
  ocrEnabled: boolean;
  visualOverlay: boolean;
  signPackId: SignLanguagePackId | null;
  speechInEnginePreference: "auto" | "webspeech" | "whisper-tiny";
  backgroundWarnings: boolean; // default false
  language: string; // BCP-47 hint for TTS / STT / OCR
}

export interface EventBus {
  emit(event: RuntimeEvent): void;
  subscribe(handler: (event: RuntimeEvent) => void): () => void;
}
```

`PerceptionRuntime` and `SignLanguageRuntime` emit domain events only. They do not call `speechSynthesis`. `SpeechBridge` is the only module that turns domain events into `SpeechRequest`s.

### 5.2 Module APIs

```ts
interface CameraService {
  request(options: { facingMode: "environment" | "user"; width: number; height: number; fps: number }): Promise<void>;
  subscribe(consumerId: string, fps: number, onFrame: (frame: CameraFrame) => void): () => void;
  reconfigure(options: Partial<{ width: number; height: number; fps: number; facingMode: "environment" | "user" }>): Promise<void>;
  stop(): Promise<void>;
}

interface PerceptionRuntime {
  start(camera: CameraService): Promise<void>;
  stop(): Promise<void>;
  setOcrEnabled(enabled: boolean): void;
  readNow(): Promise<OcrResult>; // user-initiated; real inference
}

interface SignLanguageRuntime {
  start(camera: CameraService, packId: SignLanguagePackId): Promise<void>;
  stop(): Promise<void>;
  setVocabularyFilter(glosses: string[] | "all"): void;
}

interface SpeechPriorityQueue {
  enqueue(request: SpeechRequest): void;
  cancel(category?: SpeechRequest["category"]): void;
  pause(): void;
  resume(): void;
}

interface NavigationService {
  plan(destination: string): Promise<NavigationState>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface PrefsStore {
  get(): Promise<UserPrefs>;
  set(patch: Partial<UserPrefs>): Promise<void>;
}

interface EventBus {
  emit(event: RuntimeEvent): void;
  subscribe(handler: (event: RuntimeEvent) => void): () => void;
}

interface ModeController {
  current(): Mode;
  enter(mode: Exclude<Mode, "idle">): Promise<void>;
  exitToIdle(): Promise<void>;
}

interface SpeechBridge {
  // Subscribes to warning | ocr | navigation | sign | feature-unavailable
  // and enqueues SpeechRequest. No other module speaks.
  attach(bus: EventBus, queue: SpeechPriorityQueue): void;
}

interface AssistCommandParser {
  // Assist mode only. Closed set; unknown transcripts do not invent a scene.
  parse(transcript: string, confidence: number): AssistCommand | null;
}

interface SttAdapter {
  start(sink: "assist-commands" | "communication"): Promise<void>;
  stop(): Promise<void>;
}
```

`PerceptionRuntime` must not import `SignLanguageRuntime`. Both talk to `CameraService` and emit `RuntimeEvent` on the shared `EventBus`.

Mode-switch contracts:

- `enter("communicate")` stops `PerceptionRuntime`, cancels speech categories `hazard` / `safety` / `scene` / `nav`, points `SttAdapter` at `communication`, reconfigures the camera to user-facing.
- `enter("assist")` stops `SignLanguageRuntime`, cancels category `sign`, points `SttAdapter` at `assist-commands`, reconfigures the camera to environment-facing.
- In Communicate, `AssistCommandParser` is not subscribed. Partner speech is never parsed as “read this”.
- In Assist, `CommunicationSession` is not subscribed.

### 5.3 Worker message contracts

Main thread never sends raw `ImageData` arrays through structured clone. Frames are transferred.

```ts
type DetectionIn =
  | { type: "init"; modelUrl: string; backend: "webgpu" | "wasm" }
  | { type: "frame"; frameId: number; timestampMs: number; bitmap: ImageBitmap }
  | { type: "configure"; inputSize: 320 | 416 | 640 }
  | { type: "dispose" };

type DetectionOut =
  | { type: "ready"; backend: "webgpu" | "wasm" }
  | {
      type: "boxes";
      frameId: number;
      inferMs: number;
      detections: Array<{
        label: string;
        confidence: number;
        box: { x: number; y: number; w: number; h: number };
      }>;
    }
  | { type: "error"; message: string };

type OcrIn =
  | { type: "init"; detModelUrl: string; recModelUrl: string; backend: "webgpu" | "wasm" }
  | { type: "frame"; frameId: number; timestampMs: number; bitmap: ImageBitmap }
  | { type: "read-now"; frameId: number; timestampMs: number; bitmap: ImageBitmap }
  | { type: "cancel" }
  | { type: "dispose" };

type LandmarkIn =
  | { type: "init" }
  | { type: "frame"; frameId: number; timestampMs: number; bitmap: ImageBitmap }
  | { type: "dispose" };
```

If `init` fails, the worker emits `error` and the runtime emits `feature-unavailable`. It does not fall back to canned boxes or canned glosses.

### 5.4 FastAPI HTTP contracts

No video upload endpoint exists.

```
GET  /health
     → { status: "ok", version: string }

GET  /v1/models/manifest
     → { models: Array<{ id: string; kind: "yolo" | "ocr-det" | "ocr-rec" | "sign";
                          version: string; sha256: string; url: string; license: string }> }

GET  /v1/route?from=lat,lon&to=string|lat,lon&profile=foot-walking
     → { destinationLabel: string; steps: Array<{ instruction: string;
          distanceMeters: number; location: { lat: number; lon: number } }> }
     Provider distances only. Never camera-derived meters.

POST /v1/ocr/document
     multipart still image, only after an explicit client confirmation flag
     → { text: string; source: "backend-document" }

GET  /v1/flags
     → { disabled: string[] }
```

### 5.5 Supabase tables

```
user_prefs     (user_id pk → auth.uid(), prefs jsonb, updated_at)
saved_places   (id, user_id, label, lat, lon, created_at)
```

RLS: `user_id = auth.uid()`. There is no frames table, no transcript-of-scene table, and no sign-video table in v1.

---

## 6. Project folder structure

Nothing below is generated until its phase starts. This is the target layout.

```
mara/
  apps/
    web/                          # Vite + React + TypeScript + Tailwind
      index.html
      src/
        main.tsx
        app/
          App.tsx
          ModeController.ts
          EventBus.ts
          SpeechBridge.ts
          routes.tsx
        pages/
          AssistPage.tsx
          CommunicatePage.tsx
          SettingsPage.tsx
        a11y/
          LiveRegion.tsx
          ScreenReaderDetect.ts
          FocusShell.tsx
        modules/
          camera/
            CameraService.ts
            FrameBus.ts
          perception/             # Assist only
            PerceptionRuntime.ts
            detection.worker.ts   # YOLO ONNX
            ocr.worker.ts
            tracker.ts
            spatial.ts
            motion.ts
            warnings.ts
          speech/
            SpeechPriorityQueue.ts
            TtsAdapter.ts
            SttAdapter.ts
            WhisperAdapter.ts
            AssistCommandParser.ts
          navigation/
            NavigationService.ts
            RouteClient.ts
          sign-language/          # Isolated module. See §9.
            index.ts
            SignLanguageRuntime.ts
            landmark.worker.ts
            classifier.worker.ts
            IsolatedSignClassifier.ts
            FingerspellDecoder.ts
            GlossToSpeech.ts
            CommunicationSession.ts
            packs/
              asl.json            # gloss -> spoken text, no weights
          prefs/
            PrefsStore.ts
          telemetry/
            ClientTelemetry.ts
        lib/
          ort.ts                  # ORT-Web init, WebGPU/WASM
          capabilities.ts
          supabase.ts
      public/
        models/                   # hashed ONNX + wasm, served locally
      tests/
        a11y/
        modules/
    api/                          # FastAPI
      app/
        main.py
        routers/
          health.py
          routing.py
          models.py
          ocr.py
        services/
          ors_client.py
          paddle_ocr.py
        schemas/
      tests/
  packages/
    shared/
      src/
        events.ts
        prefs.ts
        index.ts
  models/                         # training + export, not the web runtime
    detection/
    ocr/
    sign-language/
      train/
      export/
  docs/
    ARCHITECTURE.md               # this file
    PHASES.md                     # copied acceptance tests per phase
  supabase/
    migrations/
    policies.sql
```

Rules:

- `modules/sign-language/**` is a hard boundary. No YOLO types, no warning policy, no Assist UI imports.
- Workers live next to their module, not in a global `workers/` junk drawer.
- ONNX weights are versioned artifacts, not committed as opaque “magic” blobs without a manifest.

---

## 7. Continuous camera inference

### 7.1 Ownership

1. `CameraService` calls `getUserMedia` once.
2. It writes frames to an `OffscreenCanvas` on a capture loop (`requestVideoFrameCallback` where available).
3. `FrameBus` clones/`transferFromImageBitmap` to each subscriber at that subscriber’s max FPS.
4. If a worker’s last infer is still running, the next frame for that worker is dropped (never queued deeply). Latest-frame-wins.

### 7.2 Assist loop

```
capture 15–24 fps
    ├─ detection worker  (budget 80–150 ms)  → boxes
    │       └─ tracker → DetectedObject[]
    │              ├─ spatial.ts → zone + depth band
    │              ├─ motion.ts  → approaching | receding | crossing | stationary
    │              └─ warnings.ts → WarningEvent[] → EventBus → SpeechBridge
    └─ ocr worker        (budget 400–800 ms, 1–2 Hz, cancellable)
            └─ only regions that are new or stable for N frames
```

Adaptive scheduler:

1. Measure `inferMs` for detection.
2. Set detection interval to `max(minInterval, inferMs * 1.2)`.
3. If a severity-0 warning is active, pause OCR.
4. If `inferMs` exceeds 300 ms for 5 seconds, drop to YOLO-n (if on s) or reduce input size (640 → 416 → 320) and announce power save.
5. On `document.hidden`, stop inference; keep the stream only if the user enabled background warnings (default off; mobile browsers will kill it anyway).

### 7.3 Communicate loop

```
capture 24–30 fps, user-facing camera, higher min resolution on the torso
    └─ landmark worker (MediaPipe Holistic)
           ├─ IsolatedSignClassifier (window of T frames)
           └─ FingerspellDecoder (letter stream)
                  └─ CommunicationSession → EventBus (sign / communication-turn)
                                           → SpeechBridge (priority 5)
                                           → large-text UI
```

Assist workers are terminated before this loop starts.

### 7.4 What we will test per frame path

- Dropped-frame counter (must drop, must not backlog).
- End-to-end camera-to-event latency (p50 / p95) logged locally.
- No main-thread long tasks > 50 ms from ML.

---

## 8. Speech prioritization

Speech is a safety control, not a caption dump.

### 8.1 Priority table

| P | Category | Interrupt current speech | Typical source |
| --- | --- | --- | --- |
| 0 | Hazard | Yes | Near-zone obstacle, crossing path at near |
| 1 | Safety | Yes if current is P>=3 | Approaching obstacle, lost-track of a near object |
| 2 | User | No (wait, then speak) | “Read this”, “What is around me” |
| 3 | Navigation | No | Upcoming turn from routing API |
| 4 | Scene | No | New track, cooldown 8–15 s per `dedupeKey` |
| 5 | Sign | No | Gloss / fingerspell in Communicate |
| 6 | System | No | Engine fallback, power save, permission denied |

### 8.2 Rules

1. **Single speaker.** Only `SpeechBridge` enqueues. Perception, OCR, navigation, and sign emit domain events.
2. **Dedupe** on `dedupeKey` (e.g. `track:17:person:near:center`). Repeat only after `cooldownMs` or a zone/depth/motion change.
3. **Hysteresis** on depth bands so objects do not chatter `near/mid`.
4. **Rate limit** P4 to a maximum of 1 utterance / 4 s.
5. **Interrupt:** P0 calls `speechSynthesis.cancel()` then speaks; live region uses `aria-live="assertive"`. P1 cancels only if the current utterance is P>=3.
6. **Barge-in:** if STT hears the user speaking, pause P3–P6. Do not pause P0–P1.
7. **Screen reader mode:** enqueue the same text to a polite/assertive live region; do not also call `speechSynthesis` unless the user opted into dual speech.
8. **Category mute** is a user pref (e.g. mute scene, keep hazards).
9. **Never invent.** If there are no tracks, say nothing ambient. User-initiated “what is around me” may say “I don’t see any objects I recognize.” It may not describe a canned room.

### 8.3 Assist voice commands (closed set)

`AssistCommandParser` accepts only these intents. Transcripts that do not match are discarded. There is no general-purpose voice assistant.

| Utterance examples | Command | Effect |
| --- | --- | --- |
| “read this”, “read now” | `read-now` | `PerceptionRuntime.readNow()`; speak OCR or “I can’t find readable text” |
| “what is around me”, “what’s around” | `describe-scene` | Speak current tracks once: `{label}, {zone}, {depth}` per object, or the empty-scene line |
| “stop”, “be quiet” | `stop-speech` | Cancel P2–P6; leave P0–P1 armed |
| “mute scene” / “unmute scene” | `mute-scene` / `unmute-scene` | Pref patch |
| “where am I” | `where-am-i` | Speak last GPS fix + next nav step if a route is active; if geo is denied, announce that |

Unknown utterances do not trigger scene speech. STT engine identity is spoken once when Assist starts (`P6`).

### 8.4 Warning policy (camera, not maps)

A warning fires only when all of these hold:

- Track age >= 2 frames (kill one-frame flicker).
- Confidence >= configured threshold (default 0.45, label-specific later).
- Depth is `near`, or `mid` with `motion === "approaching"`.
- `crossing` in the near/mid band of a hazard label is severity 0.
- Label is in the hazard set (person, car, bicycle, bus, truck, motorcycle; later: stair, pole, curb).

Utterance template (deterministic, not LLM):  
`"{label}, {zone}, {depth}"` → “person, left, near”.

No LLM in the Assist hot path. An LLM would add latency and hallucination.

---

## 9. Sign-language module isolation

### 9.1 Boundary

The only public export is `modules/sign-language/index.ts`:

- `SignLanguageRuntime`
- `CommunicationSession`
- `SignLanguagePackId`, `SignPrediction` (re-exported from shared)

Forbidden:

- Importing perception, YOLO, OCR, or warning types.
- Sharing the detection worker.
- Writing into Assist scene speech (P4).
- Loading a language pack that has no classifier weights.
- Subscribing `AssistCommandParser` to Communicate STT.

### 9.2 Internal pipeline

1. **LandmarkExtractor** (worker): MediaPipe Holistic → normalized landmark sequence (hands + pose + selected face points).
2. **IsolatedSignClassifier** (worker): ONNX temporal model (TCN or small transformer) over a sliding window. Output = gloss + confidence.
3. **FingerspellDecoder**: letter-level model or heuristic on right-hand shape trajectory; commits a letter after dwell + cooldown.
4. **GlossToSpeech**: pack JSON maps `THANK-YOU` → “Thank you”. Unknown gloss is not spoken.
5. **CommunicationSession**: merges signer turns and speaker STT turns into a visible transcript (large type) and optional TTS for the speaking partner. Partner text is the recognizer transcript. It is not rewritten, summarized, or “cleaned up” by an LLM.

### 9.3 What v1 will and will not do

**Will**

- Classify a documented closed set of isolated signs (start with a published subset, e.g. a WLASL-derived pack, size chosen after a held-out accuracy gate).
- Decode fingerspelling for the supported pack.
- Speak the mapped phrase only above a confidence threshold (default 0.75) and after a short hold, so jitter does not talk.
- Show the gloss on screen if confidence is between 0.5 and 0.75 (“did you sign THANK-YOU?”) without speaking it.
- Let the speaking partner’s speech appear as large text via STT (capability 10). The sink is `CommunicationSession`, not Assist commands.

**Will not**

- Claim continuous ASL/SASL/BSL sentence translation.
- Silently guess low-confidence signs.
- Train or “improve” from user video unless that is a later, explicitly consented data program.
- Run inside Assist mode.

### 9.4 Accuracy gate (must pass before the module is enabled in UI)

On a held-out clip set for the shipped vocabulary:

- Top-1 isolated-sign accuracy >= 80% at the operating threshold.
- False-positive speech (spoken wrong gloss) <= 5% of windows.
- If the gate fails, the Communicate route stays disabled and reports `feature-unavailable`.

---

## 10. Accessibility, privacy, security

- WCAG 2.2 AA minimum; target AAA for contrast and live-region use on Assist.
- Entire primary task is keyboard operable. Camera preview is decorative for blind users and `aria-hidden` unless a low-vision user enables the visual overlay.
- Permissions are requested at the moment of need, with spoken and textual explanation.
- Frames stay in RAM / workers. No upload of video in Assist. Communicate is the same.
- Document OCR upload is a separate, confirmed action.
- Supabase RLS on all user tables. FastAPI holds third-party keys.
- No analytics of scene contents by default.

---

## 11. Implementation roadmap

Each phase is independently testable. A phase is not done if it uses fixtures instead of the real engine named in its acceptance test.

### Phase 0 — Scaffold and capability truth

**Build:** monorepo (`apps/web`, `apps/api`, `packages/shared`), Tailwind, Radix/shadcn, routing, Assist/Communicate/Settings shells with no fake actions, capability probe page.

**Test:** Lighthouse a11y on shells; keyboard-only pass; capability probe matches reality on Chrome and Firefox (WebGPU/WASM, speech, camera). Disabled features announce why.

### Phase 1 — Camera and FrameBus

**Build:** `CameraService`, permission UX, `FrameBus`, worker echo that returns frame id + timestamp + mean luma (proves transfer, not a fake detector).

**Test:** 200 frames with latest-frame-wins (queue depth 1); p95 handoff < 30 ms; stop() releases the camera (browser indicator clears).

### Phase 2 — Real object detection

**Build:** Export YOLO11n to ONNX (record the AGPL or commercial-license decision in the model manifest); `detection.worker.ts` + ORT-Web; draw boxes only when visual overlay is on; emit detections without tracking.

**Test:** Recorded clip of a person and a chair produces those labels above threshold. Empty wall produces no objects. No hardcoded labels in the worker. `init` failure emits `feature-unavailable`, not a fixture list.

### Phase 2b — Tracking, spatial, custom classes

**Build:** tracker, zone/depth bands, optional access-class fine-tune when dataset is ready.

**Test:** Same object keeps `trackId` across occlusions of < 300 ms; walking left→center changes `zone`; a box whose area grows over 1 s is `approaching`. Custom classes ship only after mAP gate on a labeled set.

### Phase 3 — Warnings and speech queue

**Build:** warning policy, `SpeechBridge`, `SpeechPriorityQueue`, `speechSynthesis`, `aria-live`, category mute.

**Test:** Near person triggers one spoken line, not one per frame. A later P4 does not interrupt P0. A P0 while P4 is speaking cancels TTS (`speechSynthesis.cancel`) and speaks the hazard. Screen-reader mode does not double-speak. Unit tests for dedupe/cooldown with recorded track traces. `SpeechBridge` is the only enqueue site (lint or unit guard).

### Phase 4 — OCR

**Build:** continuous text detection + recognition worker; “Read now” uses the same engine (Tesseract.js allowed only if ONNX rec is not ready, and latency is spoken).

**Test:** A printed sign in a recorded clip yields text that matches the sign (human-checked). Blank scene yields no text. “Read now” without a camera is rejected, not mocked.

### Phase 5 — Speech in

**Build:** Web Speech STT; Whisper-tiny fallback; barge-in; engine disclosure.

**Test:** Spoken “read this” on a real clip fires `readNow`. Spoken “what is around me” on a clip with a person speaks that track; on an empty wall speaks the empty-scene line. Spoken “please tell me a story” is ignored (no scene speech). Firefox uses Whisper-tiny or announces unavailability. The live engine name is disclosed once. No canned transcripts.

### Phase 6 — Navigation

**Build:** FastAPI routing proxy, geolocation, orientation, spoken maneuvers (P3), Assist warnings still P0–P1 during a route.

**Test:** Plan a real pedestrian route to a known address; instructions match the provider polyline. Indoor/denied geo announces failure. Camera still detects a person while routing.

### Phase 7 — Sign-language runtime (isolated)

**Build:** MediaPipe landmarks, isolated-sign ONNX for pack `asl` (or the first pack that passes the gate), confidence hold, no Assist coupling.

**Test:** Held-out clips for 3 known signs produce those glosses; a non-sign clip produces no speech. Importing `perception` from `sign-language` fails a lint/boundary test.

### Phase 8 — Communication session

**Build:** Gloss→speech, partner STT→large text, turn list, exclusive mode switch (Assist workers die).

**Test:** Mode switch releases YOLO memory (worker gone). Signer gloss speaks once. Partner utterance appears as the STT transcript with no rewrite. While Communicate is active, “read this” is not parsed as an Assist command. Assist workers stay dead for the whole session.

### Phase 9 — Supabase persistence

**Build:** auth, prefs (speech engine, muted categories, screen-reader dual speech, language pack), saved places.

**Test:** RLS denies other users’ prefs. Offline Assist still runs; prefs sync when back online.

### Phase 10 — Hardening

**Build:** adaptive FPS, power-save announcement, iOS measurement, model manifest + integrity hash, kill switch, privacy review, latency dashboard (local).

**Test:** Device matrix (Chrome desktop, Chrome Android, Safari iOS). Any unsupported cell is documented and disabled, not faked.

---

## 12. First implementation slice (when coding starts)

Do **not** start at sign language or navigation.

Order: Phase 0 → 1 → 2 → 3. That path produces a genuinely useful Assist loop: camera, real YOLO, spoken hazards. Everything else plugs into the same event bus.

---

## 13. Open decisions (do not block Phase 0–3)

1. First sign-language pack: ASL (public data) vs a smaller custom vocab.
2. Routing vendor: OpenRouteService vs self-hosted OSRM.
3. Whether low-vision visual overlay is default-off (recommended) or a settings toggle on first run.
4. Whether Whisper-tiny is shipped in the main bundle or downloaded on first offline STT use.
5. YOLO distribution path: open-source Mara under AGPL, buy an Ultralytics commercial license, or replace the detector with a permissively licensed ONNX model.
6. First isolated-sign vocabulary size (must still pass the §9.4 gate).
7. Whether Assist commands require a wake phrase. Default: no wake phrase while Assist is foregrounded; commands are the closed table in §8.3.

These are product choices. They do not change the module boundaries above.
