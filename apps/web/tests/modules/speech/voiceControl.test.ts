import { describe, expect, it, vi } from "vitest";
import type { AssistCommand } from "@mara/shared";
import {
  applyAssistCommand,
  assistActivity,
} from "@/modules/speech/applyAssistCommand";
import { VoiceController } from "@/modules/speech/VoiceController";

function command(name: AssistCommand["name"], raw = name): AssistCommand {
  return { name, rawTranscript: raw, confidence: 1 };
}

describe("applyAssistCommand", () => {
  it("maps start, stop, and reading to the real Assist actions", () => {
    const calls: string[] = [];
    const actions = {
      startVision: () => calls.push("startVision"),
      stop: () => calls.push("stop"),
      startReading: () => calls.push("startReading"),
      stopReading: () => calls.push("stopReading"),
      startNavigation: () => calls.push("startNavigation"),
      stopNavigation: () => calls.push("stopNavigation"),
    };

    applyAssistCommand(command("start-vision"), actions);
    applyAssistCommand(command("start-reading"), actions);
    applyAssistCommand(command("stop-reading"), actions);
    applyAssistCommand(command("stop"), actions);

    expect(calls).toEqual(["startVision", "startReading", "stopReading", "stop"]);
  });

  it("maps start and stop navigation to the path-assistance actions", () => {
    const calls: string[] = [];
    const actions = {
      startVision: () => {
        throw new Error("startVision should not run from the command mapper");
      },
      stop: () => {
        throw new Error("stop should not run");
      },
      startReading: () => {
        throw new Error("startReading should not run");
      },
      stopReading: () => {
        throw new Error("stopReading should not run");
      },
      startNavigation: () => calls.push("startNavigation"),
      stopNavigation: () => calls.push("stopNavigation"),
    };

    applyAssistCommand(command("start-navigation", "start navigation"), actions);
    applyAssistCommand(command("stop-navigation", "stop navigation"), actions);
    expect(calls).toEqual(["startNavigation", "stopNavigation"]);
  });

  it("reports honest activity labels", () => {
    expect(assistActivity({ mode: "idle", visionRunning: false, readingRunning: false })).toBe(
      "idle",
    );
    expect(assistActivity({ mode: "assist", visionRunning: true, readingRunning: false })).toBe(
      "continuous vision",
    );
    expect(assistActivity({ mode: "assist", visionRunning: false, readingRunning: true })).toBe(
      "reading",
    );
    expect(assistActivity({ mode: "assist", visionRunning: true, readingRunning: true })).toBe(
      "both",
    );
    expect(
      assistActivity({ mode: "communicate", visionRunning: false, readingRunning: false }),
    ).toBe("communicate");
  });
});

describe("VoiceController anti-echo", () => {
  it("drops TTS echo while Mara is speaking", () => {
    const onCommand = vi.fn();
    const onHeard = vi.fn();
    const controller = new VoiceController({
      isTtsSpeaking: () => true,
      getLastSpokenText: () => "Camera is live. Continuous object detection is on.",
      onCommand,
      onHeard,
    });

    controller.onTtsStarted();
    expect(
      controller.handleTranscript(
        "Camera is live. Continuous object detection is on.",
        1,
        true,
      ),
    ).toBeNull();
    expect(controller.handleTranscript("object detection", 1, true)).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
    expect(onHeard).not.toHaveBeenCalled();
  });

  it("barge-in interrupts scene speech and dispatches stop", () => {
    const onCommand = vi.fn();
    const onBargeIn = vi.fn();
    const onBargeInEnd = vi.fn();
    const controller = new VoiceController({
      isTtsSpeaking: () => true,
      getLastSpokenText: () => "Chair ahead.",
      onCommand,
      onBargeIn,
      onBargeInEnd,
    });

    controller.onTtsStarted();
    expect(controller.handleTranscript("sto", 1, false)).toBeNull();
    expect(onBargeIn).toHaveBeenCalledTimes(1);
    expect(controller.handleTranscript("stop", 1, true)?.name).toBe("stop");
    expect(onBargeInEnd).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it("drops results that match the last spoken utterance", () => {
    const onCommand = vi.fn();
    const controller = new VoiceController({
      isTtsSpeaking: () => false,
      getLastSpokenText: () => "Reading is off.",
      onCommand,
    });

    expect(controller.handleTranscript("Reading is off.", 1, true)).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("barge-in during TTS, then honors the post-TTS echo guard", () => {
    const onCommand = vi.fn();
    let speaking = true;
    const controller = new VoiceController({
      isTtsSpeaking: () => speaking,
      getLastSpokenText: () => "Voice control is listening.",
      now: () => 10_000,
      echoGuardMs: 400,
      onCommand,
    });

    controller.onTtsStarted();
    expect(controller.handleTranscript("start", 1, true)?.name).toBe("start-vision");

    speaking = false;
    controller.onTtsEnded();
    expect(controller.handleTranscript("start", 1, true)).toBeNull();

    const later = new VoiceController({
      isTtsSpeaking: () => false,
      getLastSpokenText: () => "Voice control is listening.",
      now: () => 10_500,
      echoGuardMs: 400,
      onCommand,
    });
    const result = later.handleTranscript("start reading", 0.9, true);
    expect(result?.name).toBe("start-reading");
    expect(onCommand).toHaveBeenCalledTimes(2);
  });

  it("ignores unknown phrases after TTS is idle", () => {
    const onCommand = vi.fn();
    const onHeard = vi.fn();
    const controller = new VoiceController({
      isTtsSpeaking: () => false,
      getLastSpokenText: () => "",
      onCommand,
      onHeard,
    });

    expect(controller.handleTranscript("please tell me a story", 1, true)).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
    expect(onHeard).toHaveBeenCalledWith("please tell me a story", null);
  });
});
