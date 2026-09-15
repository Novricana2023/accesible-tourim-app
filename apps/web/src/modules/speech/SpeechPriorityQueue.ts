import {
  clampSpeechRate,
  clampSpeechVolume,
  type SpeechRequest,
  type UserPrefs,
} from "@mara/shared";
import type { SpeechOutput } from "./TtsAdapter";

export type AnnounceHandler = (
  text: string,
  politeness: "assertive" | "polite",
) => void;

export type SpeechLifecycleHandler = (
  type: "speech-started" | "speech-ended",
  id: string,
) => void;

function userRank(request: SpeechRequest): number {
  if (request.rank) {
    return request.rank;
  }
  if (request.priority === 0) {
    return 1;
  }
  if (request.priority === 1) {
    return 2;
  }
  if (request.priority <= 3) {
    return 3;
  }
  if (request.priority === 4) {
    return 4;
  }
  return 5;
}

function canInterrupt(incoming: SpeechRequest, current: SpeechRequest): boolean {
  if (incoming.priority === 0 || incoming.rank === 1) {
    return true;
  }
  if (incoming.interrupt && incoming.priority === 6) {
    return true;
  }

  const incomingRank = userRank(incoming);
  const currentRank = userRank(current);

  if (incomingRank === 1) {
    return true;
  }
  if ((incomingRank === 2 || incomingRank === 3) && currentRank >= 4) {
    return true;
  }
  if (incoming.priority === 1 && current.priority >= 3) {
    return true;
  }
  return false;
}

export class SpeechPriorityQueue {
  private current: SpeechRequest | null = null;
  private pending: SpeechRequest[] = [];
  private generation = 0;
  private paused = false;
  private readonly lastByKey = new Map<string, number>();
  private lastSceneMs = 0;
  private lastSpokenText = "";
  private readonly tts: SpeechOutput;
  private readonly getPrefs: () => UserPrefs;
  private readonly onAnnounce: AnnounceHandler;
  private readonly onLifecycle?: SpeechLifecycleHandler;

  constructor(
    tts: SpeechOutput,
    getPrefs: () => UserPrefs,
    onAnnounce: AnnounceHandler,
    onLifecycle?: SpeechLifecycleHandler,
  ) {
    this.tts = tts;
    this.getPrefs = getPrefs;
    this.onAnnounce = onAnnounce;
    this.onLifecycle = onLifecycle;
  }

  enqueue(request: SpeechRequest): boolean {
    const prefs = this.getPrefs();
    if (prefs.mutedCategories.includes(request.category)) {
      return false;
    }

    const last = this.lastByKey.get(request.dedupeKey);
    if (
      request.cooldownMs > 0 &&
      last !== undefined &&
      request.createdMs - last < request.cooldownMs
    ) {
      return false;
    }

    const rank = userRank(request);
    if (rank >= 4 && this.lastSceneMs > 0 && request.createdMs - this.lastSceneMs < 4000) {
      return false;
    }

    if (this.current) {
      if (canInterrupt(request, this.current)) {
        this.interruptCurrent();
        this.play(request);
        return true;
      }
      if (rank >= 4 && userRank(this.current) <= 2) {
        return false;
      }
      this.queuePending(request);
      return true;
    }

    if (this.paused && rank > 2) {
      this.queuePending(request);
      return true;
    }

    this.play(request);
    return true;
  }

  cancel(category?: SpeechRequest["category"]): void {
    if (category) {
      this.pending = this.pending.filter((item) => item.category !== category);
      if (this.current?.category === category) {
        this.endCurrent(true);
        this.playNext();
      }
      return;
    }

    this.pending = [];
    this.endCurrent(true);
  }

  pause(): void {
    this.paused = true;
    this.tts.pause();
  }

  pauseNonSafety(): void {
    this.paused = true;
    if (!this.current) {
      return;
    }
    if (userRank(this.current) <= 2) {
      return;
    }
    this.tts.pause();
  }

  resume(): void {
    this.paused = false;
    this.tts.resume();
    if (!this.current) {
      this.playNext();
    }
  }

  isSpeaking(): boolean {
    return this.current !== null || this.tts.isSpeaking();
  }

  getLastSpokenText(): string {
    return this.lastSpokenText;
  }

  setRate(rate: number): void {
    this.tts.setRate(clampSpeechRate(rate));
  }

  setVolume(volume: number): void {
    this.tts.setVolume(clampSpeechVolume(volume));
  }

  setVoice(voice: SpeechSynthesisVoice | null): void {
    this.tts.setVoice(voice);
  }

  getCurrent(): SpeechRequest | null {
    return this.current;
  }

  getPending(): SpeechRequest[] {
    return [...this.pending];
  }

  private interruptCurrent(): void {
    this.pending = this.pending.filter((item) => userRank(item) <= 2);
    this.endCurrent(true);
  }

  private endCurrent(cancelTts: boolean): void {
    const endedId = this.current?.id;
    this.generation += 1;
    if (cancelTts) {
      this.tts.cancel();
    }
    this.current = null;
    if (endedId) {
      this.onLifecycle?.("speech-ended", endedId);
    }
  }

  private queuePending(request: SpeechRequest): void {
    const rank = userRank(request);
    this.pending = this.pending.filter((item) => {
      if (item.dedupeKey === request.dedupeKey) {
        return false;
      }
      if (rank <= 3 && userRank(item) >= 4) {
        return false;
      }
      return true;
    });
    this.pending.push(request);
    this.pending.sort((left, right) => userRank(left) - userRank(right));
    if (this.pending.length > 4) {
      this.pending.length = 4;
    }
  }

  private playNext(): void {
    const next = this.pending.shift();
    if (!next) {
      return;
    }
    if (this.paused && userRank(next) > 2) {
      this.pending.unshift(next);
      return;
    }
    this.play(next);
  }

  private play(request: SpeechRequest): void {
    const prefs = this.getPrefs();
    const rate = clampSpeechRate(prefs.speechRate);
    this.tts.setRate(rate);

    this.current = request;
    this.lastSpokenText = request.text;
    this.lastByKey.set(request.dedupeKey, request.createdMs);
    if (userRank(request) >= 4) {
      this.lastSceneMs = request.createdMs;
    }

    const politeness: "assertive" | "polite" =
      userRank(request) <= 2 || request.interrupt ? "assertive" : "polite";

    this.onAnnounce(request.text, politeness);
    this.onLifecycle?.("speech-started", request.id);

    const generation = this.generation;
    const finish = (): void => {
      if (generation !== this.generation || this.current?.id !== request.id) {
        return;
      }
      this.current = null;
      this.onLifecycle?.("speech-ended", request.id);
      this.playNext();
    };

    if (prefs.ttsMode === "speechSynthesis" || prefs.ttsMode === "both") {
      this.tts.speak(request.text, {
        interrupt: false,
        lang: prefs.language,
        rate,
        onEnd: finish,
      });
      return;
    }

    finish();
  }
}
