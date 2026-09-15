export interface SpeechVoiceOption {
  uri: string;
  name: string;
  lang: string;
  localService: boolean;
}

export function listSpeechVoices(): SpeechVoiceOption[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }
  return window.speechSynthesis.getVoices().map((voice) => ({
    uri: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService,
  }));
}

export function resolveSpeechVoice(
  uri: string | null,
  languageHint: string,
): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  if (uri) {
    const match = voices.find((voice) => voice.voiceURI === uri);
    if (match) {
      return match;
    }
  }
  const langPrefix = languageHint.split("-")[0]?.toLowerCase();
  return (
    voices.find((voice) => voice.lang.toLowerCase() === languageHint.toLowerCase()) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(langPrefix ?? "en")) ??
    null
  );
}
