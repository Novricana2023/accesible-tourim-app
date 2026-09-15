import type { CommunicationLanguageConfig, SignLanguagePackId } from "@mara/shared";
import { DEFAULT_SPEECH_IN_LOCALE, SIGN_LANGUAGE_PACK_IDS } from "@mara/shared";
import aslPack from "./packs/asl.json" with { type: "json" };
import bslPack from "./packs/bsl.json" with { type: "json" };
import saslPack from "./packs/sasl.json" with { type: "json" };
import type { SignPackManifest, SignVocabEntry } from "./types";

const PACKS: Record<SignLanguagePackId, SignPackManifest> = {
  asl: aslPack as SignPackManifest,
  sasl: saslPack as SignPackManifest,
  bsl: bslPack as SignPackManifest,
};

export function listSignPackIds(): SignLanguagePackId[] {
  return [...SIGN_LANGUAGE_PACK_IDS];
}

export function getSignPack(packId: SignLanguagePackId): SignPackManifest | null {
  return PACKS[packId] ?? null;
}

export function listVocabulary(packId: SignLanguagePackId): SignVocabEntry[] {
  return getSignPack(packId)?.vocabulary ?? [];
}

export function spokenPhraseForGloss(
  packId: SignLanguagePackId,
  gloss: string,
): string | null {
  const normalized = gloss.trim().toUpperCase();
  const entry = listVocabulary(packId).find((item) => item.gloss === normalized);
  return entry?.spokenText ?? null;
}

export function communicationLanguageConfig(
  signPackId: SignLanguagePackId,
  spokenSttLocale: string,
): CommunicationLanguageConfig {
  return {
    signPackId,
    spokenSttLocale: spokenSttLocale.trim() || DEFAULT_SPEECH_IN_LOCALE,
  };
}
