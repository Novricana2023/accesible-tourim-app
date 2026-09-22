export interface SpeakOptions {
  interrupt?: boolean;
  lang?: string;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface SpeechOutput {
  prime?(): void;
  speak(text: string, options: SpeakOptions): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  setRate(rate: number): void;
  getRate(): number;
  setVolume(volume: number): void;
  getVolume(): number;
  setVoice(voice: SpeechSynthesisVoice | null): void;
  isSpeaking(): boolean;
}

function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

const SPEAK_AFTER_CANCEL_MS = 50;

export class TtsAdapter implements SpeechOutput {
  private rate = 1;
  private volume = 1;
  private voice: SpeechSynthesisVoice | null = null;
  private speakGeneration = 0;
  private speakTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAfterCancel = false;

  setRate(rate: number): void {
    this.rate = rate;
  }

  getRate(): number {
    return this.rate;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  getVolume(): number {
    return this.volume;
  }

  setVoice(voice: SpeechSynthesisVoice | null): void {
    this.voice = voice;
  }

  isSpeaking(): boolean {
    return speechAvailable() && window.speechSynthesis.speaking;
  }

  /** Unlock speechSynthesis on iOS/Safari — call from a user tap before async sign recognition. */
  prime(): void {
    if (!speechAvailable()) {
      return;
    }
    try {
      window.speechSynthesis.resume();
    } catch {
      /* some browsers omit resume */
    }
    void window.speechSynthesis.getVoices();
    const utterance = new SpeechSynthesisUtterance("\u200b");
    utterance.volume = 0.01;
    utterance.rate = 2;
    window.speechSynthesis.speak(utterance);
  }

  speak(text: string, options: SpeakOptions): void {
    if (options.interrupt) {
      this.cancel();
    }

    if (!speechAvailable()) {
      options.onStart?.();
      options.onEnd?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate ?? this.rate;
    utterance.volume = this.volume;
    if (this.voice) {
      utterance.voice = this.voice;
    }
    if (options.lang) {
      utterance.lang = options.lang;
    }

    let settled = false;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      options.onEnd?.();
    };

    utterance.onstart = () => {
      options.onStart?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    const generation = this.speakGeneration;
    const start = (): void => {
      if (generation !== this.speakGeneration) {
        return;
      }
      this.pendingAfterCancel = false;
      this.speakTimer = null;
      window.speechSynthesis.speak(utterance);
    };

    if (this.pendingAfterCancel) {
      this.clearSpeakTimer();
      this.speakTimer = setTimeout(start, SPEAK_AFTER_CANCEL_MS);
      return;
    }

    start();
  }

  cancel(): void {
    this.speakGeneration += 1;
    this.clearSpeakTimer();
    this.pendingAfterCancel = true;
    if (!speechAvailable()) {
      return;
    }
    window.speechSynthesis.cancel();
  }

  pause(): void {
    if (!speechAvailable()) {
      return;
    }
    window.speechSynthesis.pause();
  }

  resume(): void {
    if (!speechAvailable()) {
      return;
    }
    window.speechSynthesis.resume();
  }

  private clearSpeakTimer(): void {
    if (this.speakTimer === null) {
      return;
    }
    clearTimeout(this.speakTimer);
    this.speakTimer = null;
  }
}
