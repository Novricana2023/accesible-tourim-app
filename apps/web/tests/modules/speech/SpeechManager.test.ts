import { describe, expect, it } from "vitest";
import type { DetectedObject, DetectionResult, SpeechRequest, UserPrefs } from "@mara/shared";
import { defaultPrefs } from "@/modules/prefs/PrefsStore";
import { SpeechManager } from "@/modules/speech/SpeechManager";
import type { SpeakOptions, SpeechOutput } from "@/modules/speech/TtsAdapter";
import { TtsAdapter } from "@/modules/speech/TtsAdapter";

class FakeTts implements SpeechOutput {
  utterances: Array<{ text: string; rate: number }> = [];
  cancelCount = 0;
  rate = 1;
  private onEnd: (() => void) | null = null;

  speak(text: string, options: SpeakOptions): void {
    this.utterances.push({ text, rate: options.rate ?? this.rate });
    options.onStart?.();
    this.onEnd = options.onEnd ?? null;
  }

  complete(): void {
    const end = this.onEnd;
    this.onEnd = null;
    end?.();
  }

  cancel(): void {
    this.cancelCount += 1;
    this.onEnd = null;
  }

  pause(): void {
    /* no-op */
  }

  resume(): void {
    /* no-op */
  }

  setRate(rate: number): void {
    this.rate = rate;
  }

  getRate(): number {
    return this.rate;
  }

  setVolume(): void {
    /* no-op */
  }

  getVolume(): number {
    return 1;
  }

  setVoice(): void {
    /* no-op */
  }

  isSpeaking(): boolean {
    return this.onEnd !== null;
  }
}

function prefs(overrides: Partial<UserPrefs> = {}): UserPrefs {
  return { ...defaultPrefs(), ttsMode: "speechSynthesis", ...overrides };
}

function object(overrides: Partial<DetectedObject> = {}): DetectedObject {
  return {
    trackId: "1",
    label: "person",
    confidence: 0.8,
    box: { x: 0.2, y: 0.2, w: 0.4, h: 0.5 },
    zone: "center",
    depth: "near",
    motion: "stationary",
    firstSeenMs: 0,
    lastSeenMs: 200,
    ...overrides,
  };
}

function result(objects: DetectedObject[], timestampMs = 200): DetectionResult {
  return {
    frameId: 1,
    timestampMs,
    objects,
    inferenceMs: 10,
    backend: "wasm",
  };
}

function request(overrides: Partial<SpeechRequest> = {}): SpeechRequest {
  return {
    id: overrides.id ?? "req",
    priority: 4,
    text: "Chair ahead.",
    interrupt: false,
    category: "scene",
    dedupeKey: "2:chair:center:near:stationary",
    cooldownMs: 0,
    createdMs: 200,
    rank: 4,
    ...overrides,
  };
}

describe("SpeechManager", () => {
  it("ingests structured detections and does not invent an empty scene", () => {
    const tts = new FakeTts();
    const manager = new SpeechManager({
      tts,
      getPrefs: () => prefs(),
      onAnnounce: () => {
        /* capture via tts */
      },
    });

    manager.ingestDetections(result([]));
    expect(tts.utterances).toEqual([]);

    manager.ingestDetections(result([object()]));
    expect(tts.utterances.map((item) => item.text)).toEqual(["Person ahead."]);
  });

  it("dedupes the same track until cooldown expires", () => {
    const tts = new FakeTts();
    const manager = new SpeechManager({
      tts,
      getPrefs: () => prefs(),
      onAnnounce: () => {
        /* unused */
      },
    });

    manager.ingestDetections(result([object()]), 200);
    tts.complete();
    manager.ingestDetections(result([object()]), 400);
    expect(tts.utterances).toHaveLength(1);
  });

  it("rank 1 interrupts rank 4", () => {
    const tts = new FakeTts();
    const manager = new SpeechManager({
      tts,
      getPrefs: () => prefs(),
      onAnnounce: () => {
        /* unused */
      },
    });

    manager.enqueue(
      request({
        id: "scene",
        text: "Chair ahead.",
        rank: 4,
        priority: 4,
      }),
    );
    expect(tts.utterances.map((item) => item.text)).toEqual(["Chair ahead."]);

    manager.enqueue(
      request({
        id: "hazard",
        text: "Person approaching ahead.",
        rank: 1,
        priority: 0,
        interrupt: true,
        category: "hazard",
        dedupeKey: "1:person:center:near:approaching",
      }),
    );

    expect(tts.cancelCount).toBeGreaterThan(0);
    expect(tts.utterances.map((item) => item.text)).toEqual([
      "Chair ahead.",
      "Person approaching ahead.",
    ]);
    expect(manager.getQueue().getCurrent()?.id).toBe("hazard");
  });

  it("rank 5 does not interrupt rank 1", () => {
    const tts = new FakeTts();
    const manager = new SpeechManager({
      tts,
      getPrefs: () => prefs(),
      onAnnounce: () => {
        /* unused */
      },
    });

    manager.enqueue(
      request({
        id: "hazard",
        text: "Person approaching ahead.",
        rank: 1,
        priority: 0,
        interrupt: true,
        category: "hazard",
        dedupeKey: "1:person:center:near:approaching",
      }),
    );
    manager.enqueue(
      request({
        id: "info",
        text: "Bottle ahead, far.",
        rank: 5,
        priority: 4,
        category: "scene",
        dedupeKey: "9:bottle:center:far:stationary",
      }),
    );

    expect(tts.cancelCount).toBe(0);
    expect(tts.utterances.map((item) => item.text)).toEqual([
      "Person approaching ahead.",
    ]);
    expect(manager.getQueue().getCurrent()?.id).toBe("hazard");
  });

  it("applies speech rate to the utterance", () => {
    const spoken: Array<{ text: string; rate: number }> = [];

    class FakeUtterance {
      text: string;
      rate = 1;
      lang = "";
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FakeUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak(utterance: FakeUtterance) {
          spoken.push({ text: utterance.text, rate: utterance.rate });
          utterance.onstart?.();
        },
        cancel() {
          /* unused */
        },
        pause() {
          /* unused */
        },
        resume() {
          /* unused */
        },
      },
    });

    const adapter = new TtsAdapter();
    adapter.setRate(1.4);
    adapter.speak("Person ahead.", { rate: 1.4 });
    expect(spoken).toEqual([{ text: "Person ahead.", rate: 1.4 }]);

    const tts = new FakeTts();
    const current = prefs({ speechRate: 0.8 });
    const manager = new SpeechManager({
      tts,
      getPrefs: () => current,
      onAnnounce: () => {
        /* unused */
      },
    });
    manager.setRate(0.8);
    manager.ingestDetections(result([object()]));
    expect(tts.utterances[0]?.rate).toBe(0.8);
  });

  it("never speaks Door from a non-door detection", () => {
    const tts = new FakeTts();
    const announced: string[] = [];
    const manager = new SpeechManager({
      tts,
      getPrefs: () => prefs(),
      onAnnounce: (text) => {
        announced.push(text);
      },
    });

    manager.ingestDetections(
      result([object({ label: "chair", zone: "center", depth: "near" })]),
    );
    expect(announced.join(" ")).not.toMatch(/door/i);
    expect(tts.utterances[0]?.text).toBe("Chair ahead.");
  });

  it("does not dump scene tracks while path assistance owns speech", () => {
    const tts = new FakeTts();
    const manager = new SpeechManager({
      tts,
      getPrefs: () => prefs(),
      onAnnounce: () => {
        /* unused */
      },
    });
    manager.setPathAssistanceActive(true);
    manager.ingestDetections(result([object()]));
    expect(tts.utterances).toEqual([]);
    manager.setPathAssistanceActive(false);
    manager.ingestDetections(result([object()]));
    expect(tts.utterances.map((item) => item.text)).toEqual(["Person ahead."]);
  });

  it("does not speak a low-confidence sign prediction", () => {
    const tts = new FakeTts();
    const manager = new SpeechManager({
      tts,
      getPrefs: () => prefs(),
      onAnnounce: () => {
        /* unused */
      },
    });
    manager.ingestSign({
      packId: "asl",
      gloss: "HELLO",
      spokenText: "Hello",
      confidence: 0.6,
      kind: "isolated",
      startedMs: 1,
      endedMs: 2,
    });
    expect(tts.utterances).toEqual([]);
    manager.ingestSign({
      packId: "asl",
      gloss: "HELLO",
      spokenText: "Hello",
      confidence: 0.88,
      kind: "isolated",
      startedMs: 1,
      endedMs: 2,
    });
    expect(tts.utterances.map((item) => item.text)).toEqual(["Hello"]);
  });
});
