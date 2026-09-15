import { describe, expect, it, vi } from "vitest";
import { CommunicationSession } from "@/modules/sign-language/CommunicationSession";
import { parseAssistCommand } from "@/modules/speech/AssistCommandParser";
import { routeSttTranscript } from "@/modules/speech/routeSttTranscript";

describe("routeSttTranscript exclusive sinks", () => {
  it("does not parse Assist commands while Communicate is active", () => {
    const session = new CommunicationSession();
    const handleTranscript = vi.fn((text: string, confidence: number) =>
      parseAssistCommand(text, confidence),
    );

    const routed = routeSttTranscript({
      sink: "communication",
      communicateMode: true,
      text: "start",
      confidence: 1,
      isFinal: true,
      ingestCommunication: (text, isFinal, echo) => {
        session.ingestPartnerSpeech(text, { isFinal, echo });
      },
      voice: { handleTranscript },
      echo: { lastSpokenText: "", ttsSpeaking: false },
    });

    expect(routed).toBe("communication");
    expect(handleTranscript).not.toHaveBeenCalled();
    expect(parseAssistCommand("start", 1)?.name).toBe("start-vision");
    expect(session.getSpeakerTurns().map((turn) => turn.text)).toEqual(["start"]);
    expect(session.getSignerTurns()).toEqual([]);
  });

  it("does not run Assist parsers for partner phrases such as read this", () => {
    const handleTranscript = vi.fn();
    routeSttTranscript({
      sink: "assist-commands",
      communicateMode: true,
      text: "read this",
      confidence: 1,
      isFinal: true,
      ingestCommunication: () => {
        /* partner captions only */
      },
      voice: { handleTranscript },
      echo: { lastSpokenText: "", ttsSpeaking: false },
    });
    expect(handleTranscript).not.toHaveBeenCalled();
  });

  it("does not caption Mara TTS echo as partner speech", () => {
    const session = new CommunicationSession();
    routeSttTranscript({
      sink: "communication",
      communicateMode: true,
      text: "Thank you",
      confidence: 1,
      isFinal: true,
      ingestCommunication: (text, isFinal, echo) => {
        session.ingestPartnerSpeech(text, { isFinal, echo });
      },
      voice: { handleTranscript: vi.fn() },
      echo: { lastSpokenText: "Thank you", ttsSpeaking: false },
    });
    expect(session.getSpeakerTurns()).toEqual([]);
  });

  it("still dispatches Assist commands outside Communicate", () => {
    const handleTranscript = vi.fn();
    const routed = routeSttTranscript({
      sink: "assist-commands",
      communicateMode: false,
      text: "start reading",
      confidence: 1,
      isFinal: true,
      ingestCommunication: () => {
        throw new Error("Communicate ingest must not run in Assist");
      },
      voice: { handleTranscript },
      echo: { lastSpokenText: "", ttsSpeaking: false },
    });
    expect(routed).toBe("assist-commands");
    expect(handleTranscript).toHaveBeenCalledWith("start reading", 1, true);
  });
});
