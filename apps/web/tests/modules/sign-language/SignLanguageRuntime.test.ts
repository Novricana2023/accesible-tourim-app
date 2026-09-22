import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RuntimeEvent, SignLanguagePackId } from "@mara/shared";
import { createEventBus } from "@/app/EventBus";
import type { CameraService } from "@/modules/camera/CameraService";
import { SignLanguageRuntime } from "@/modules/sign-language/SignLanguageRuntime";
import type {
  LandmarkExtractor,
  LandmarkFrame,
  SignClassifier,
  SignClassifierResult,
} from "@/modules/sign-language/types";
import { CLASSIFY_EVERY } from "@/modules/sign-language/types";

const MODULE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src/modules/sign-language",
);

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx") || full.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function fakeCamera(): CameraService {
  return {
    subscribe: () => () => {
      /* no frames */
    },
  } as unknown as CameraService;
}

class ScriptedExtractor implements LandmarkExtractor {
  private onLandmarks: ((frame: LandmarkFrame) => void) | null = null;

  async start(onLandmarks: (frame: LandmarkFrame) => void): Promise<void> {
    this.onLandmarks = onLandmarks;
  }

  async stop(): Promise<void> {
    this.onLandmarks = null;
  }

  emit(frame: LandmarkFrame): void {
    this.onLandmarks?.(frame);
  }
}

class ScriptedClassifier implements SignClassifier {
  readonly id = "scripted-test";
  ready: boolean;
  next: SignClassifierResult | null;

  constructor(ready: boolean, next: SignClassifierResult | null = null) {
    this.ready = ready;
    this.next = next;
  }

  async load() {
    if (!this.ready) {
      return {
        ok: false as const,
        reason:
          "Sign-language pack is not loaded. No trained classifier weights were found. Tasfiri will not guess signs.",
      };
    }
    return { ok: true as const };
  }

  async predict(): Promise<SignClassifierResult | null> {
    return this.next;
  }

  async dispose(): Promise<void> {
    /* noop */
  }
}

function emptyHands(timestampMs: number): LandmarkFrame {
  return { timestampMs, hands: [[0, 0, 0]], handedness: ["Right"] };
}

async function pump(
  runtime: SignLanguageRuntime,
  extractor: ScriptedExtractor,
  frames: number,
  startMs: number,
): Promise<void> {
  for (let i = 0; i < frames; i += 1) {
    extractor.emit(emptyHands(startMs + i * 50));
    await Promise.resolve();
  }
}

describe("SignLanguageRuntime", () => {
  it("starts and stops Communicate without inventing a gloss", async () => {
    const bus = createEventBus();
    const extractor = new ScriptedExtractor();
    const runtime = new SignLanguageRuntime({
      bus,
      createExtractor: () => extractor,
      createClassifier: () => new ScriptedClassifier(false),
    });

    await runtime.start(fakeCamera(), "asl" satisfies SignLanguagePackId);
    expect(runtime.getStatus()).toBe("live");
    expect(runtime.getView().classifierReady).toBe(false);
    expect(runtime.getView().packLoaded).toBe(false);
    expect(runtime.getView().uncertainty).toBe("pack-not-loaded");
    expect(runtime.getView().vocabulary.map((item) => item.gloss)).toContain("HELLO");
    expect(runtime.getView().lastGloss).toBeNull();

    await pump(runtime, extractor, CLASSIFY_EVERY + 1, 0);
    expect(runtime.getView().lastGloss).toBeNull();

    await runtime.stop();
    expect(runtime.getStatus()).toBe("idle");
    expect(runtime.getView().lastGloss).toBeNull();
  });

  it("does not speak a low-confidence guess", async () => {
    const spoken: string[] = [];
    const bus = createEventBus();
    bus.subscribe((event: RuntimeEvent) => {
      if (event.type === "sign") {
        spoken.push(event.prediction.spokenText);
      }
      if (event.type === "speech-request") {
        spoken.push(event.request.text);
      }
    });
    const extractor = new ScriptedExtractor();
    const classifier = new ScriptedClassifier(true, {
      gloss: "HELLO",
      confidence: 0.62,
    });
    const runtime = new SignLanguageRuntime({
      bus,
      createExtractor: () => extractor,
      createClassifier: () => classifier,
    });

    await runtime.start(fakeCamera(), "asl");
    expect(runtime.getView().classifierReady).toBe(true);

    await pump(runtime, extractor, CLASSIFY_EVERY + 2, 1000);
    expect(runtime.getView().uncertainty).toBe("uncertain");
    expect(runtime.getView().lastGloss).toBe("HELLO");
    expect(spoken).toEqual([]);
    expect(runtime.getSession().getSignerTurns()).toEqual([]);
    expect(runtime.getSession().getSpeakerTurns()).toEqual([]);
  });

  it("speaks only the pack phrase after a high-confidence hold", async () => {
    const spoken: string[] = [];
    const bus = createEventBus();
    bus.subscribe((event: RuntimeEvent) => {
      if (event.type === "sign") {
        spoken.push(event.prediction.spokenText);
      }
    });
    const extractor = new ScriptedExtractor();
    const classifier = new ScriptedClassifier(true, {
      gloss: "THANK-YOU",
      confidence: 0.92,
    });
    let now = 0;
    const runtime = new SignLanguageRuntime({
      bus,
      now: () => now,
      createExtractor: () => extractor,
      createClassifier: () => classifier,
    });

    await runtime.start(fakeCamera(), "asl");
    now = 1000;
    await pump(runtime, extractor, CLASSIFY_EVERY, 1000);
    expect(spoken).toEqual([]);
    now = 1500;
    await pump(runtime, extractor, CLASSIFY_EVERY, 1500);
    expect(spoken).toEqual(["Thank you"]);
    expect(runtime.getSession().getSignerTurns().map((turn) => turn.text)).toEqual([
      "Thank you",
    ]);
    expect(runtime.getSession().getSpeakerTurns()).toEqual([]);

    runtime.ingestSpeaker("Thank you", true, {
      lastSpokenText: "Thank you",
      ttsSpeaking: false,
    });
    expect(runtime.getSession().getSpeakerTurns()).toEqual([]);
  });
});

describe("sign-language module isolation", () => {
  it("does not import perception, YOLO, OCR, or navigation internals", () => {
    const files = walk(MODULE_ROOT);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/modules\/perception/);
      expect(source, file).not.toMatch(/OrtYolo|yoloPostprocess|detection\.worker/);
      expect(source, file).not.toMatch(/modules\/ocr/);
      expect(source, file).not.toMatch(/modules\/navigation/);
      expect(source, file).not.toMatch(/modules\/speech/);
      expect(source, file).not.toMatch(/AssistCommandParser|VoiceController|applyAssistCommand/);
    }
  });
});
