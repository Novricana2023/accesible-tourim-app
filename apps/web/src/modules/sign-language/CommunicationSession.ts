import type { CommunicationTurn } from "@mara/shared";
import { APP_NAME } from "@/app/brand";
import { createId } from "@/lib/utils";

export const COMMUNICATION_ECHO_RULE =
  `Mode A and Mode B may run together (camera and microphone). ${APP_NAME} pauses partner listening while speaking a recognized sign, then drops leftover echo that matches that speech. ${APP_NAME}'s voice is never shown as partner captions.`;

export interface PartnerEchoContext {
  lastSpokenText: string;
  ttsSpeaking: boolean;
}

export interface CommunicationSnapshot {
  signerTurns: CommunicationTurn[];
  speakerTurns: CommunicationTurn[];
  speakerLiveText: string;
  lastSignerText: string | null;
  lastSpeakerText: string | null;
}

export interface IngestPartnerSpeechOptions {
  isFinal: boolean;
  createdMs?: number;
  echo?: PartnerEchoContext;
}

function normalizeHeard(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when partner STT is repeating Mara TTS rather than a human speaker. */
export function isTtsEcho(heard: string, lastSpoken: string): boolean {
  const spoken = normalizeHeard(lastSpoken);
  const incoming = normalizeHeard(heard);
  if (!spoken || !incoming) {
    return false;
  }
  if (incoming === spoken) {
    return true;
  }
  if (spoken.includes(incoming) && incoming.length >= 12) {
    return true;
  }
  if (incoming.includes(spoken) && spoken.length >= 12) {
    return true;
  }
  return false;
}

export class CommunicationSession {
  private signerTurns: CommunicationTurn[] = [];
  private speakerTurns: CommunicationTurn[] = [];
  private speakerLiveText = "";
  private readonly listeners = new Set<(snapshot: CommunicationSnapshot) => void>();

  getSnapshot(): CommunicationSnapshot {
    return {
      signerTurns: this.signerTurns,
      speakerTurns: this.speakerTurns,
      speakerLiveText: this.speakerLiveText,
      lastSignerText: this.signerTurns.at(-1)?.text ?? null,
      lastSpeakerText: this.speakerTurns.at(-1)?.text ?? null,
    };
  }

  getSignerTurns(): CommunicationTurn[] {
    return this.signerTurns;
  }

  getSpeakerTurns(): CommunicationTurn[] {
    return this.speakerTurns;
  }

  subscribe(listener: (snapshot: CommunicationSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  addSigner(text: string, createdMs = Date.now()): CommunicationTurn | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }
    const turn: CommunicationTurn = {
      id: createId(),
      from: "signer",
      text: trimmed,
      createdMs,
    };
    this.signerTurns = [...this.signerTurns, turn].slice(-40);
    this.emit();
    return turn;
  }

  ingestPartnerSpeech(
    text: string,
    options: IngestPartnerSpeechOptions,
  ): CommunicationTurn | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }
    if (options.echo?.ttsSpeaking) {
      return null;
    }
    if (options.echo && isTtsEcho(trimmed, options.echo.lastSpokenText)) {
      return null;
    }
    if (!options.isFinal) {
      this.speakerLiveText = trimmed;
      this.emit();
      return null;
    }
    const turn: CommunicationTurn = {
      id: createId(),
      from: "speaker",
      text: trimmed,
      createdMs: options.createdMs ?? Date.now(),
    };
    this.speakerTurns = [...this.speakerTurns, turn].slice(-40);
    this.speakerLiveText = "";
    this.emit();
    return turn;
  }

  addSpeaker(text: string, createdMs = Date.now()): CommunicationTurn | null {
    return this.ingestPartnerSpeech(text, { isFinal: true, createdMs });
  }

  reset(): void {
    this.signerTurns = [];
    this.speakerTurns = [];
    this.speakerLiveText = "";
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
