import { describe, expect, it } from "vitest";
import { voiceLiveStatus } from "@/components/VoiceControl";

describe("voiceLiveStatus", () => {
  it("reports listening, heard command, and current mode", () => {
    expect(
      voiceLiveStatus({
        status: "listening",
        engine: "webspeech",
        activity: "both",
        lastHeardCommand: "start-reading",
      }),
    ).toBe("Listening. Current mode: continuous vision and reading. Heard start reading.");
  });

  it("reports denied permission honestly", () => {
    expect(
      voiceLiveStatus({
        status: "denied",
        engine: "webspeech",
        activity: "idle",
        lastHeardCommand: null,
      }),
    ).toMatch(/Microphone permission was denied/);
  });

  it("reports a Web Speech network failure honestly", () => {
    expect(
      voiceLiveStatus({
        status: "unavailable",
        engine: "webspeech",
        activity: "idle",
        lastHeardCommand: null,
        failure: "network",
      }),
    ).toMatch(/network connection/);
  });
});
