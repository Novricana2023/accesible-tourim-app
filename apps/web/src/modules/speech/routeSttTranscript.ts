import type { AssistCommand } from "@mara/shared";
import type { PartnerEchoContext } from "@/modules/sign-language/CommunicationSession";
import type { SttSink } from "./SttAdapter";

export type { SttSink } from "./SttAdapter";

export interface SttVoiceSink {
  handleTranscript: (
    text: string,
    confidence: number,
    isFinal: boolean,
  ) => AssistCommand | null;
}

export function routeSttTranscript(input: {
  sink: SttSink;
  communicateMode: boolean;
  text: string;
  confidence: number;
  isFinal: boolean;
  ingestCommunication: (
    text: string,
    isFinal: boolean,
    echo: PartnerEchoContext,
  ) => void;
  voice: SttVoiceSink;
  echo: PartnerEchoContext;
}): SttSink {
  if (input.sink === "communication" || input.communicateMode) {
    input.ingestCommunication(input.text, input.isFinal, input.echo);
    return "communication";
  }
  input.voice.handleTranscript(input.text, input.confidence, input.isFinal);
  return "assist-commands";
}
