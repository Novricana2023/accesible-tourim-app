export function visionIsReadyForNavigation(status: string): boolean {
  return status === "live" || status === "paused";
}

export function navigationNeedsVisionStart(status: string): boolean {
  return !visionIsReadyForNavigation(status);
}
