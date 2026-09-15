export type SttStatus =
  | "idle"
  | "requesting"
  | "listening"
  | "paused"
  | "denied"
  | "unavailable";

export type SttEngine = "webspeech" | "unavailable";
export type SttFailure = "network" | null;

export type SttSink = "assist-commands" | "communication";

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
  length: number;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export interface SttAdapterDeps {
  getRecognitionCtor?: () => SpeechRecognitionCtor | null;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  isSecureContext?: () => boolean;
  getLang?: () => string;
  onTranscript: (text: string, confidence: number, isFinal: boolean) => void;
  onStatus: (status: SttStatus) => void;
}

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function resolveSpeechInEngine(input: {
  preference: "auto" | "webspeech" | "whisper-tiny";
  webSpeechAvailable: boolean;
}): SttEngine {
  if (input.webSpeechAvailable) {
    return "webspeech";
  }
  return "unavailable";
}

export function speechInEngineDisclosure(engine: SttEngine): string {
  if (engine === "webspeech") {
    return "Speech-in uses the Web Speech API. In Chrome this is a Google network service.";
  }
  return "Voice control is unavailable. This browser has no speech recognition, and Whisper-tiny is not shipped.";
}

export function partnerSpeechDisclosure(engine: SttEngine): string {
  if (engine === "webspeech") {
    return "Partner speech uses the Web Speech API. In Chrome this is a Google network service. Captions are the recognizer transcript, not a paraphrase.";
  }
  return "Partner speech captions are unavailable. This browser has no speech recognition, and Whisper-tiny is not shipped.";
}

export class SttAdapter {
  private readonly getRecognitionCtor: () => SpeechRecognitionCtor | null;
  private readonly getUserMediaFn: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;
  private readonly isSecureContextFn: () => boolean;
  private readonly getLang: () => string;
  private readonly onTranscript: (
    text: string,
    confidence: number,
    isFinal: boolean,
  ) => void;
  private readonly onStatus: (status: SttStatus) => void;

  private recognition: SpeechRecognitionLike | null = null;
  private wanted = false;
  private pausedForTts = false;
  private status: SttStatus = "idle";
  private restarting = false;
  private sink: SttSink = "assist-commands";
  private failure: SttFailure = null;

  constructor(deps: SttAdapterDeps) {
    this.getRecognitionCtor = deps.getRecognitionCtor ?? getSpeechRecognitionCtor;
    this.getUserMediaFn =
      deps.getUserMedia ??
      ((constraints) => navigator.mediaDevices.getUserMedia(constraints));
    this.isSecureContextFn =
      deps.isSecureContext ?? (() => window.isSecureContext);
    this.getLang = deps.getLang ?? (() => "en-US");
    this.onTranscript = deps.onTranscript;
    this.onStatus = deps.onStatus;
  }

  getStatus(): SttStatus {
    return this.status;
  }

  getEngine(): SttEngine {
    return this.getRecognitionCtor() ? "webspeech" : "unavailable";
  }

  getSink(): SttSink {
    return this.wanted ? this.sink : "assist-commands";
  }

  getFailure(): SttFailure {
    return this.failure;
  }

  async start(sink: SttSink = "assist-commands"): Promise<void> {
    this.failure = null;
    this.sink = sink;
    if (this.wanted && (this.status === "listening" || this.status === "paused")) {
      if (this.recognition) {
        this.recognition.lang = this.getLang();
      }
      return;
    }
    if (!this.getRecognitionCtor()) {
      this.setStatus("unavailable");
      return;
    }
    if (!this.isSecureContextFn()) {
      this.setStatus("unavailable");
      return;
    }

    this.setStatus("requesting");
    try {
      const stream = await this.getUserMediaFn({ audio: true });
      for (const track of stream.getTracks()) {
        track.stop();
      }
    } catch (error) {
      const name =
        error && typeof error === "object" && "name" in error
          ? String((error as { name: string }).name)
          : "";
      if (
        name === "NotAllowedError" ||
        name === "PermissionDeniedError" ||
        name === "SecurityError"
      ) {
        this.setStatus("denied");
        return;
      }
      this.setStatus("unavailable");
      return;
    }

    this.wanted = true;
    this.pausedForTts = false;
    this.ensureRecognition();
    this.begin();
  }

  stop(): void {
    this.wanted = false;
    this.pausedForTts = false;
    this.sink = "assist-commands";
    this.tearDownRecognition();
    if (this.status !== "denied" && this.status !== "unavailable") {
      this.setStatus("idle");
    }
  }

  pauseForTts(): void {
    if (!this.wanted) {
      return;
    }
    this.pausedForTts = true;
    this.stopRecognitionOnly();
    if (this.status === "listening") {
      this.setStatus("paused");
    }
  }

  resumeAfterTts(): void {
    if (!this.wanted || !this.pausedForTts) {
      return;
    }
    this.pausedForTts = false;
    this.begin();
  }

  private setStatus(status: SttStatus): void {
    this.status = status;
    this.onStatus(status);
  }

  private ensureRecognition(): void {
    if (this.recognition) {
      return;
    }
    const Ctor = this.getRecognitionCtor();
    if (!Ctor) {
      this.setStatus("unavailable");
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.getLang();
    recognition.onresult = (event) => {
      if (this.pausedForTts || !this.wanted) {
        return;
      }
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result || result.length === 0) {
          continue;
        }
        const alt = result[0];
        const transcript = alt.transcript.trim();
        if (!transcript) {
          continue;
        }
        this.onTranscript(transcript, Number.isFinite(alt.confidence) ? alt.confidence : 1, result.isFinal);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        this.wanted = false;
        this.failure = null;
        this.tearDownRecognition();
        this.setStatus("denied");
        return;
      }
      if (event.error === "network") {
        this.wanted = false;
        this.failure = "network";
        this.tearDownRecognition();
        this.setStatus("unavailable");
        return;
      }
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
    };
    recognition.onend = () => {
      if (!this.wanted || this.pausedForTts || this.restarting) {
        return;
      }
      this.restarting = true;
      try {
        recognition.start();
      } catch {
        /* already started */
      }
      this.restarting = false;
    };
    this.recognition = recognition;
  }

  private begin(): void {
    if (!this.wanted || this.pausedForTts) {
      return;
    }
    this.ensureRecognition();
    if (!this.recognition) {
      return;
    }
    this.recognition.lang = this.getLang();
    try {
      this.recognition.start();
      this.setStatus("listening");
    } catch {
      this.setStatus("listening");
    }
  }

  private stopRecognitionOnly(): void {
    if (!this.recognition) {
      return;
    }
    try {
      this.recognition.stop();
    } catch {
      /* already stopped */
    }
  }

  private tearDownRecognition(): void {
    if (!this.recognition) {
      return;
    }
    this.recognition.onresult = null;
    this.recognition.onerror = null;
    this.recognition.onend = null;
    try {
      this.recognition.abort();
    } catch {
      /* already stopped */
    }
    this.recognition = null;
  }
}
