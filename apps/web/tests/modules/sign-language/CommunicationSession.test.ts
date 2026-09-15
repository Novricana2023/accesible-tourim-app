import { describe, expect, it } from "vitest";
import type { CommunicationLanguageConfig, SignLanguagePackId } from "@mara/shared";
import {
  DEFAULT_SPEECH_IN_LOCALE,
  SIGN_LANGUAGE_PACK_IDS,
  sanitizeSpeechInLocale,
} from "@mara/shared";
import {
  CommunicationSession,
  isTtsEcho,
} from "@/modules/sign-language/CommunicationSession";
import {
  communicationLanguageConfig,
  getSignPack,
  listSignPackIds,
  listVocabulary,
  spokenPhraseForGloss,
} from "@/modules/sign-language/GlossToSpeech";

describe("CommunicationSession channels", () => {
  it("keeps signer and speaker turns in separate lists", () => {
    const session = new CommunicationSession();
    session.addSigner("Hello");
    session.ingestPartnerSpeech("How are you", { isFinal: true });

    const snapshot = session.getSnapshot();
    expect(snapshot.signerTurns.map((turn) => turn.text)).toEqual(["Hello"]);
    expect(snapshot.speakerTurns.map((turn) => turn.text)).toEqual(["How are you"]);
    expect(snapshot.signerTurns.every((turn) => turn.from === "signer")).toBe(true);
    expect(snapshot.speakerTurns.every((turn) => turn.from === "speaker")).toBe(true);
    expect(snapshot.lastSignerText).toBe("Hello");
    expect(snapshot.lastSpeakerText).toBe("How are you");
  });

  it("shows interim partner speech without committing a turn", () => {
    const session = new CommunicationSession();
    const committed = session.ingestPartnerSpeech("hello there", { isFinal: false });
    expect(committed).toBeNull();
    expect(session.getSpeakerTurns()).toEqual([]);
    expect(session.getSnapshot().speakerLiveText).toBe("hello there");
  });

  it("does not invent empty signer or speaker turns", () => {
    const session = new CommunicationSession();
    expect(session.addSigner("   ")).toBeNull();
    expect(session.ingestPartnerSpeech(" ", { isFinal: true })).toBeNull();
    expect(session.getSignerTurns()).toEqual([]);
    expect(session.getSpeakerTurns()).toEqual([]);
  });
});

describe("CommunicationSession anti-echo", () => {
  it("does not caption Mara TTS as partner speech", () => {
    const session = new CommunicationSession();
    const echoed = session.ingestPartnerSpeech("Thank you", {
      isFinal: true,
      echo: { lastSpokenText: "Thank you", ttsSpeaking: false },
    });
    expect(echoed).toBeNull();
    expect(session.getSpeakerTurns()).toEqual([]);

    const whileSpeaking = session.ingestPartnerSpeech("hello from the partner", {
      isFinal: true,
      echo: { lastSpokenText: "Thank you", ttsSpeaking: true },
    });
    expect(whileSpeaking).toBeNull();
    expect(session.getSpeakerTurns()).toEqual([]);
  });

  it("captions partner speech that is not Mara's last utterance", () => {
    const session = new CommunicationSession();
    const turn = session.ingestPartnerSpeech("Where is the station", {
      isFinal: true,
      echo: { lastSpokenText: "Thank you", ttsSpeaking: false },
    });
    expect(turn?.text).toBe("Where is the station");
    expect(session.getSpeakerTurns()).toHaveLength(1);
  });

  it("treats matching TTS as echo", () => {
    expect(isTtsEcho("Thank you", "Thank you")).toBe(true);
    expect(isTtsEcho("thank you", "Thank you.")).toBe(true);
    expect(isTtsEcho("Where is the station", "Thank you")).toBe(false);
  });
});

describe("sign pack and spoken locale extension points", () => {
  it("registers asl, sasl, and bsl pack slots", () => {
    expect(listSignPackIds()).toEqual(["asl", "sasl", "bsl"]);
    expect(SIGN_LANGUAGE_PACK_IDS).toEqual(["asl", "sasl", "bsl"]);
    for (const packId of SIGN_LANGUAGE_PACK_IDS) {
      expect(getSignPack(packId)?.packId).toBe(packId);
    }
  });

  it("maps ASL glosses to pack phrases and leaves future packs empty", () => {
    expect(spokenPhraseForGloss("asl", "THANK-YOU")).toBe("Thank you");
    expect(spokenPhraseForGloss("asl", "unknown-sign")).toBeNull();
    expect(listVocabulary("sasl")).toEqual([]);
    expect(listVocabulary("bsl")).toEqual([]);
  });

  it("keeps spoken STT locale independent of the sign pack", () => {
    const config: CommunicationLanguageConfig = communicationLanguageConfig(
      "asl" satisfies SignLanguagePackId,
      "en-US",
    );
    expect(config.signPackId).toBe("asl");
    expect(config.spokenSttLocale).toBe("en-US");
    expect(sanitizeSpeechInLocale("en-GB")).toBe("en-GB");
    expect(sanitizeSpeechInLocale("not a locale!!!")).toBe(DEFAULT_SPEECH_IN_LOCALE);
  });
});
