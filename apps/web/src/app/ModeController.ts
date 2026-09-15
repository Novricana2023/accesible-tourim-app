import type { Mode } from "@mara/shared";

export class ModeController {
  private mode: Mode = "idle";
  private readonly listeners = new Set<(mode: Mode) => void>();

  current(): Mode {
    return this.mode;
  }

  subscribe(listener: (mode: Mode) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async enter(mode: Exclude<Mode, "idle">): Promise<void> {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    for (const listener of this.listeners) {
      listener(this.mode);
    }
  }

  async exitToIdle(): Promise<void> {
    if (this.mode === "idle") {
      return;
    }
    this.mode = "idle";
    for (const listener of this.listeners) {
      listener(this.mode);
    }
  }
}
