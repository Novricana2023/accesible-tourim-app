import { describe, expect, it } from "vitest";
import {
  AssistCommandParser,
  parseAssistCommand,
} from "@/modules/speech/AssistCommandParser";

describe("AssistCommandParser", () => {
  const parser = new AssistCommandParser();

  it("maps start phrases to start-vision", () => {
    const phrases = [
      "Start",
      "please start",
      "start now",
      "start vision",
      "start continuous vision",
      "start vision assistance",
      "begin object detection",
    ];
    for (const phrase of phrases) {
      expect(parseAssistCommand(phrase, 0.9)?.name, phrase).toBe("start-vision");
    }
  });

  it("maps stop phrases to full stop", () => {
    const phrases = ["Stop", "full stop", "stop everything", "stop vision", "stop assistance"];
    for (const phrase of phrases) {
      expect(parseAssistCommand(phrase, 0.9)?.name, phrase).toBe("stop");
    }
  });

  it("maps start reading without treating it as start vision", () => {
    const phrases = [
      "Start reading",
      "please start reading",
      "start the reading",
      "begin reading now",
      "start continuous reading",
    ];
    for (const phrase of phrases) {
      expect(parseAssistCommand(phrase, 0.8)?.name, phrase).toBe("start-reading");
    }
  });

  it("maps stop reading without a full stop", () => {
    const phrases = ["Stop reading", "stop the reading", "end reading", "stop ocr"];
    for (const phrase of phrases) {
      expect(parseAssistCommand(phrase, 0.8)?.name, phrase).toBe("stop-reading");
    }
  });

  it("maps start and stop navigation", () => {
    expect(parser.parse("Start navigation", 1)?.name).toBe("start-navigation");
    expect(parser.parse("please start navigating", 1)?.name).toBe("start-navigation");
    expect(parser.parse("Stop navigation", 1)?.name).toBe("stop-navigation");
    expect(parser.parse("stop navigating", 1)?.name).toBe("stop-navigation");
    expect(parser.parse("cancel navigation", 1)?.name).toBe("stop-navigation");
  });

  it("ignores unknown phrases", () => {
    const unknown = [
      "please tell me a story",
      "what is around me",
      "read this",
      "mute scene",
      "where am I",
      "hello mara",
      "start cooking",
    ];
    for (const phrase of unknown) {
      expect(parseAssistCommand(phrase, 0.99), phrase).toBeNull();
    }
  });

  it("keeps the raw transcript on a match", () => {
    const command = parseAssistCommand("Please start reading!", 0.7);
    expect(command).toEqual({
      name: "start-reading",
      rawTranscript: "Please start reading!",
      confidence: 0.7,
    });
  });
});
