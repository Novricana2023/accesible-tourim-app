import type { AssistCommand } from "@mara/shared";
import {
  normalizeTranscript,
  parseAssistCommand,
} from "./AssistCommandParser";

export interface VoiceControllerDeps {
  isTtsSpeaking: () => boolean;
  getLastSpokenText: () => string;
  now?: () => number;
  echoGuardMs?: number;
  onCommand: (command: AssistCommand) => void;
  onHeard?: (transcript: string, command: AssistCommand | null) => void;
  onBargeIn?: () => void;
  onBargeInEnd?: () => void;
}

const DEFAULT_ECHO_GUARD_MS = 400;

export class VoiceController {
  private readonly isTtsSpeaking: () => boolean;
  private readonly getLastSpokenText: () => string;
  private readonly now: () => number;
  private readonly echoGuardMs: number;
  private readonly onCommand: (command: AssistCommand) => void;
  private readonly onHeard?: (transcript: string, command: AssistCommand | null) => void;
  private readonly onBargeIn?: () => void;
  private readonly onBargeInEnd?: () => void;
  private echoUntilMs = 0;
  private ttsSpeaking = false;

  constructor(deps: VoiceControllerDeps) {
    this.isTtsSpeaking = deps.isTtsSpeaking;
    this.getLastSpokenText = deps.getLastSpokenText;
    this.now = deps.now ?? (() => Date.now());
    this.echoGuardMs = deps.echoGuardMs ?? DEFAULT_ECHO_GUARD_MS;
    this.onCommand = deps.onCommand;
    this.onHeard = deps.onHeard;
    this.onBargeIn = deps.onBargeIn;
    this.onBargeInEnd = deps.onBargeInEnd;
  }

  onTtsStarted(): void {
    this.ttsSpeaking = true;
  }

  onTtsEnded(): void {
    this.ttsSpeaking = false;
    this.echoUntilMs = this.now() + this.echoGuardMs;
  }

  shouldDrop(): boolean {
    return this.now() < this.echoUntilMs && !this.ttsActive();
  }

  handleTranscript(
    transcript: string,
    confidence: number,
    isFinal: boolean,
  ): AssistCommand | null {
    if (this.isEcho(transcript)) {
      return null;
    }
    if (this.shouldDrop()) {
      return null;
    }

    const ttsActive = this.ttsActive();
    if (!isFinal) {
      if (ttsActive) {
        this.onBargeIn?.();
      }
      return null;
    }

    if (ttsActive) {
      this.onBargeInEnd?.();
    }
    const command = parseAssistCommand(transcript, confidence);
    this.onHeard?.(transcript, command);
    if (command) {
      this.onCommand(command);
    }
    return command;
  }

  private ttsActive(): boolean {
    return this.ttsSpeaking || this.isTtsSpeaking();
  }

  private isEcho(transcript: string): boolean {
    const last = normalizeTranscript(this.getLastSpokenText());
    const heard = normalizeTranscript(transcript);
    if (!last || !heard) {
      return false;
    }
    if (heard === last) {
      return true;
    }
    if (last.includes(heard) && heard.length >= 4) {
      return true;
    }
    if (heard.includes(last) && last.length >= 12) {
      return true;
    }
    return false;
  }
}
