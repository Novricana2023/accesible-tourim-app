import type { AssistCommandName } from "@mara/shared";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/app/brand";
import { useMaraSession } from "@/app/runtime";
import {
  assistActivityLabel,
  type AssistActivity,
} from "@/modules/speech/applyAssistCommand";
import type { SttEngine, SttFailure, SttStatus } from "@/modules/speech/SttAdapter";
import { speechInEngineDisclosure } from "@/modules/speech/SttAdapter";
import { Mic, MicOff } from "lucide-react";

const COMMAND_PHRASE: Record<AssistCommandName, string> = {
  "start-vision": "start",
  stop: "stop",
  "start-reading": "start reading",
  "stop-reading": "stop reading",
  "start-navigation": "start navigation",
  "stop-navigation": "stop navigation",
};

export function voiceLiveStatus(input: {
  status: SttStatus;
  engine: SttEngine;
  activity: AssistActivity;
  lastHeardCommand: AssistCommandName | null;
  failure?: SttFailure;
}): string {
  const mode = `Current mode: ${assistActivityLabel(input.activity)}.`;
  if (input.failure === "network") {
    return `Speech recognition needs a network connection in this browser. Voice control is off. Buttons still work. ${mode}`;
  }
  if (input.status === "unavailable" || input.engine === "unavailable") {
    return `${speechInEngineDisclosure("unavailable")} ${mode}`;
  }
  if (input.status === "denied") {
    return `Microphone permission was denied. Voice control is off. Buttons still work. ${mode}`;
  }
  if (input.status === "requesting") {
    return `Requesting the microphone. ${mode}`;
  }
  if (input.status === "paused") {
    return `Listening paused while ${APP_NAME} is speaking. ${mode}`;
  }
  if (input.status === "listening") {
    const heard = input.lastHeardCommand
      ? ` Heard ${COMMAND_PHRASE[input.lastHeardCommand]}.`
      : "";
    return `Listening. ${mode}${heard}`;
  }
  return `Voice control is off. ${mode}`;
}

export function VoiceControl() {
  const {
    voiceStatus,
    voiceEngine,
    voiceFailure,
    lastHeardCommand,
    toggleVoice,
    assistActivity: activity,
  } = useMaraSession();

  const listening = voiceStatus === "listening" || voiceStatus === "paused";
  const disabled = voiceEngine === "unavailable" && voiceStatus !== "denied";
  const live = voiceLiveStatus({
    status: voiceStatus,
    engine: voiceEngine,
    activity,
    lastHeardCommand,
    failure: voiceFailure,
  });

  return (
    <div
      role="group"
      aria-label="Voice control"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-inset px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <Button
        variant={listening ? "secondary" : "primary"}
        className="w-full shrink-0 sm:w-auto"
        aria-pressed={listening}
        aria-describedby="voice-status"
        disabled={disabled}
        onClick={() => {
          void toggleVoice();
        }}
      >
        {listening ? (
          <>
            <MicOff className="size-5" aria-hidden />
            Stop listening
          </>
        ) : (
          <>
            <Mic className="size-5" aria-hidden />
            Voice control
          </>
        )}
      </Button>
      <p
        id="voice-status"
        role="status"
        aria-live="polite"
        className="min-w-0 text-base leading-relaxed text-fg-muted"
      >
        {live}
      </p>
    </div>
  );
}
