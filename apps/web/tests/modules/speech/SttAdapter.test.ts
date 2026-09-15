import { describe, expect, it, vi } from "vitest";
import {
  SttAdapter,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from "@/modules/speech/SttAdapter";

class FakeRecognition implements SpeechRecognitionLike {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
    this.onend?.();
  }

  abort(): void {
    this.started = false;
  }

  emit(transcript: string, isFinal: boolean): void {
    this.onresult?.({
      resultIndex: 0,
      results: [
        {
          isFinal,
          length: 1,
          0: { transcript, confidence: 0.9 },
        },
      ],
    });
  }

  emitError(error: string): void {
    this.onerror?.({ error });
  }
}

describe("SttAdapter", () => {
  it("uses Web Speech when present and drops results while paused for TTS", async () => {
    const recognition = new FakeRecognition();
    const transcripts: Array<{ text: string; isFinal: boolean }> = [];
    const statuses: string[] = [];
    const adapter = new SttAdapter({
      getRecognitionCtor: () =>
        class {
          constructor() {
            return recognition;
          }
        } as unknown as new () => SpeechRecognitionLike,
      getUserMedia: async () =>
        ({
          getTracks: () => [{ stop: vi.fn() }],
        }) as unknown as MediaStream,
      isSecureContext: () => true,
      getLang: () => "en-US",
      onTranscript: (text, _confidence, isFinal) => {
        transcripts.push({ text, isFinal });
      },
      onStatus: (status) => {
        statuses.push(status);
      },
    });

    expect(adapter.getEngine()).toBe("webspeech");
    await adapter.start();
    expect(adapter.getStatus()).toBe("listening");
    expect(recognition.started).toBe(true);

    recognition.emit("start", true);
    expect(transcripts).toEqual([{ text: "start", isFinal: true }]);

    adapter.pauseForTts();
    expect(adapter.getStatus()).toBe("paused");
    recognition.emit("stop", true);
    expect(transcripts).toEqual([{ text: "start", isFinal: true }]);

    adapter.resumeAfterTts();
    expect(adapter.getStatus()).toBe("listening");
    recognition.emit("start reading", true);
    expect(transcripts).toEqual([
      { text: "start", isFinal: true },
      { text: "start reading", isFinal: true },
    ]);
  });

  it("records a communication sink and does not reset it while listening", async () => {
    const recognition = new FakeRecognition();
    const adapter = new SttAdapter({
      getRecognitionCtor: () =>
        class {
          constructor() {
            return recognition;
          }
        } as unknown as new () => SpeechRecognitionLike,
      getUserMedia: async () =>
        ({
          getTracks: () => [{ stop: vi.fn() }],
        }) as unknown as MediaStream,
      isSecureContext: () => true,
      getLang: () => "en-GB",
      onTranscript: () => {
        /* unused */
      },
      onStatus: () => {
        /* unused */
      },
    });

    await adapter.start("communication");
    expect(adapter.getSink()).toBe("communication");
    expect(recognition.lang).toBe("en-GB");
    adapter.stop();
    expect(adapter.getSink()).toBe("assist-commands");
  });

  it("records denied microphone permission", async () => {
    const adapter = new SttAdapter({
      getRecognitionCtor: () =>
        class {
          continuous = false;
          interimResults = false;
          lang = "";
          onresult = null;
          onerror = null;
          onend = null;
          start(): void {
            /* unused */
          }
          stop(): void {
            /* unused */
          }
          abort(): void {
            /* unused */
          }
        },
      getUserMedia: async () => {
        throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      },
      isSecureContext: () => true,
      onTranscript: () => {
        /* unused */
      },
      onStatus: () => {
        /* unused */
      },
    });

    await adapter.start();
    expect(adapter.getStatus()).toBe("denied");
  });

  it("stays unavailable when Web Speech is missing", async () => {
    const adapter = new SttAdapter({
      getRecognitionCtor: () => null,
      getUserMedia: async () => {
        throw new Error("should not request mic");
      },
      isSecureContext: () => true,
      onTranscript: () => {
        /* unused */
      },
      onStatus: () => {
        /* unused */
      },
    });

    expect(adapter.getEngine()).toBe("unavailable");
    await adapter.start();
    expect(adapter.getStatus()).toBe("unavailable");
  });

  it("stops listening on a Web Speech network error", async () => {
    const recognition = new FakeRecognition();
    const adapter = new SttAdapter({
      getRecognitionCtor: () =>
        class {
          constructor() {
            return recognition;
          }
        } as unknown as new () => SpeechRecognitionLike,
      getUserMedia: async () =>
        ({
          getTracks: () => [{ stop: vi.fn() }],
        }) as unknown as MediaStream,
      isSecureContext: () => true,
      onTranscript: () => {
        /* unused */
      },
      onStatus: () => {
        /* unused */
      },
    });

    await adapter.start();
    expect(adapter.getStatus()).toBe("listening");
    recognition.emitError("network");
    expect(adapter.getStatus()).toBe("unavailable");
    expect(adapter.getFailure()).toBe("network");
    expect(recognition.started).toBe(false);
  });
});
