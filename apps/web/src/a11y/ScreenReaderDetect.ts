/**
 * Browsers do not expose a reliable screen-reader API.
 * This is a conservative hint used only for the first-run default.
 * Settings remain the source of truth.
 */
export function detectScreenReaderHint(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const win = window as Window & {
    speechSynthesis?: SpeechSynthesis;
    navigator: Navigator & { userAgent?: string };
  };

  const ua = win.navigator.userAgent ?? "";
  if (/NVDA|JAWS|VoiceOver|TalkBack|Narrator/i.test(ua)) {
    return true;
  }

  return false;
}
