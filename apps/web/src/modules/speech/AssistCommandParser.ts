import type { AssistCommand, AssistCommandName } from "@mara/shared";

const LEADING_FILLER =
  /^(please|mara|hey mara|hey|okay|ok|now|just|lets|let us|can you|could you|would you|go ahead and)\s+/;
const TRAILING_FILLER = /\s+(please|now|thanks|thank you)$/;

export function normalizeTranscript(raw: string): string {
  let text = raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (let i = 0; i < 4; i += 1) {
    const next = text.replace(LEADING_FILLER, "").trim();
    if (next === text) {
      break;
    }
    text = next;
  }

  return text.replace(TRAILING_FILLER, "").trim();
}

function matchStartNavigation(text: string): boolean {
  return (
    /^(start|begin)\s+(the\s+)?(nav|navigation|navigating)$/.test(text) ||
    /^start\s+to\s+navigate$/.test(text) ||
    text === "navigate" ||
    text === "start navigating"
  );
}

function matchStopNavigation(text: string): boolean {
  return (
    /^(stop|end|cancel)\s+(the\s+)?(nav|navigation|navigating)$/.test(text) ||
    text === "stop navigating" ||
    text === "cancel navigation"
  );
}

function matchStartReading(text: string): boolean {
  return (
    /^(start|begin)\s+(the\s+)?(continuous\s+)?(reading|ocr|text reading)(\s+(now|mode|assistance))?$/.test(
      text,
    ) ||
    text === "start reading" ||
    text === "begin reading"
  );
}

function matchStopReading(text: string): boolean {
  return (
    /^(stop|end)\s+(the\s+)?(continuous\s+)?(reading|ocr|text reading)$/.test(text) ||
    text === "stop reading"
  );
}

function matchStop(text: string): boolean {
  if (text === "stop" || text === "full stop") {
    return true;
  }
  return /^(stop|end)\s+(everything|all|(the\s+)?(vision|assist|assistance|continuous vision))(\s+assistance)?$/.test(
    text,
  );
}

function matchStartVision(text: string): boolean {
  if (text === "start" || text === "begin") {
    return true;
  }
  return /^(start|begin)\s+(the\s+)?(continuous\s+)?(vision|assist|assistance|detection|detecting|camera|object detection)(\s+assistance)?$/.test(
    text,
  );
}

export function parseAssistCommand(
  transcript: string,
  confidence: number,
): AssistCommand | null {
  const text = normalizeTranscript(transcript);
  if (!text) {
    return null;
  }

  let name: AssistCommandName | null = null;
  if (matchStopNavigation(text)) {
    name = "stop-navigation";
  } else if (matchStartNavigation(text)) {
    name = "start-navigation";
  } else if (matchStopReading(text)) {
    name = "stop-reading";
  } else if (matchStartReading(text)) {
    name = "start-reading";
  } else if (matchStop(text)) {
    name = "stop";
  } else if (matchStartVision(text)) {
    name = "start-vision";
  }

  if (!name) {
    return null;
  }

  return {
    name,
    rawTranscript: transcript,
    confidence,
  };
}

export class AssistCommandParser {
  parse(transcript: string, confidence: number): AssistCommand | null {
    return parseAssistCommand(transcript, confidence);
  }
}
