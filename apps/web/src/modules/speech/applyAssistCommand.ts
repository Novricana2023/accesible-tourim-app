import type { AssistCommand } from "@mara/shared";

export interface AssistCommandActions {
  startVision: () => void;
  stop: () => void;
  startReading: () => void;
  stopReading: () => void;
  startNavigation: () => void;
  stopNavigation: () => void;
}

export function applyAssistCommand(
  command: AssistCommand,
  actions: AssistCommandActions,
): void {
  switch (command.name) {
    case "start-vision":
      actions.startVision();
      return;
    case "stop":
      actions.stop();
      return;
    case "start-reading":
      actions.startReading();
      return;
    case "stop-reading":
      actions.stopReading();
      return;
    case "start-navigation":
      actions.startNavigation();
      return;
    case "stop-navigation":
      actions.stopNavigation();
      return;
  }
}

export type AssistActivity =
  | "idle"
  | "continuous vision"
  | "reading"
  | "both"
  | "communicate";

export function assistActivity(input: {
  mode: "idle" | "assist" | "communicate";
  visionRunning: boolean;
  readingRunning: boolean;
}): AssistActivity {
  if (input.mode === "communicate") {
    return "communicate";
  }
  if (input.visionRunning && input.readingRunning) {
    return "both";
  }
  if (input.visionRunning) {
    return "continuous vision";
  }
  if (input.readingRunning) {
    return "reading";
  }
  return "idle";
}

export function assistActivityLabel(activity: AssistActivity): string {
  if (activity === "continuous vision") {
    return "continuous vision";
  }
  if (activity === "both") {
    return "continuous vision and reading";
  }
  return activity;
}
