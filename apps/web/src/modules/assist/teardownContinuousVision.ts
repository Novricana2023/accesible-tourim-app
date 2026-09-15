export async function teardownContinuousVision(deps: {
  cancelSpeech: () => void;
  resetScene: () => void;
  stopOcr?: () => Promise<void>;
  stopNavigation?: () => void | Promise<void>;
  stopPerception: () => Promise<void>;
  stopCamera: () => Promise<void>;
}): Promise<void> {
  deps.cancelSpeech();
  deps.resetScene();
  if (deps.stopOcr) {
    await deps.stopOcr();
  }
  if (deps.stopNavigation) {
    await deps.stopNavigation();
  }
  await deps.stopPerception();
  await deps.stopCamera();
}
