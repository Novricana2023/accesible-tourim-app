import type { DetectionResult, EventBus, NavigationState } from "@mara/shared";
import { filterPathRelevant, prioritizePathObstacles } from "./pathFilter";
import { PathSpeechPolicy, type PathSpeechOptions } from "./pathSpeech";
import {
  emptyPathState,
  type NavigationStatus,
  type PathAssistanceState,
  type PathObstacle,
} from "./types";

export interface NavigationRuntimeDeps {
  bus: EventBus;
  now?: () => number;
  speech?: PathSpeechOptions;
}

/**
 * Camera path assistance. Consumes DetectionResult tracks from continuous vision.
 * Does not run a detector of its own.
 */
export class NavigationRuntime {
  private readonly bus: EventBus;
  private readonly now: () => number;
  private readonly policy: PathSpeechPolicy;
  private readonly obstacleListeners = new Set<(obstacles: PathObstacle[]) => void>();
  private readonly statusListeners = new Set<(status: NavigationStatus) => void>();
  private readonly stateListeners = new Set<(state: PathAssistanceState) => void>();
  private status: NavigationStatus = "idle";
  private obstacles: PathObstacle[] = [];
  private lastInstruction = "";

  constructor(deps: NavigationRuntimeDeps) {
    this.bus = deps.bus;
    this.now = deps.now ?? (() => Date.now());
    this.policy = new PathSpeechPolicy(deps.speech);
  }

  getStatus(): NavigationStatus {
    return this.status;
  }

  isActive(): boolean {
    return this.status === "live";
  }

  getObstacles(): PathObstacle[] {
    return this.obstacles;
  }

  getState(): PathAssistanceState {
    return {
      ...emptyPathState(),
      active: this.isActive(),
      destinationLabel: this.isActive() ? "Path assistance" : "",
      nextInstruction: this.lastInstruction,
      obstacles: this.obstacles,
    };
  }

  subscribeObstacles(listener: (obstacles: PathObstacle[]) => void): () => void {
    this.obstacleListeners.add(listener);
    listener(this.obstacles);
    return () => {
      this.obstacleListeners.delete(listener);
    };
  }

  subscribeStatus(listener: (status: NavigationStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  subscribeState(listener: (state: PathAssistanceState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  start(): void {
    if (this.status === "live") {
      return;
    }
    this.policy.reset();
    this.obstacles = [];
    this.lastInstruction = "";
    this.setStatus("live");
    this.emitState();
  }

  stop(): void {
    if (this.status === "idle") {
      return;
    }
    this.policy.reset();
    this.obstacles = [];
    this.lastInstruction = "";
    this.setStatus("idle");
    this.emitState();
  }

  ingest(result: DetectionResult, now = result.timestampMs || this.now()): PathObstacle[] {
    if (this.status !== "live") {
      return [];
    }

    const obstacles = prioritizePathObstacles(filterPathRelevant(result.objects));
    this.obstacles = obstacles;
    const requests = this.policy.requestsFromObstacles(obstacles, now);
    for (const request of requests) {
      this.lastInstruction = request.text;
      this.bus.emit({ type: "speech-request", request });
    }
    this.emitState();
    return obstacles;
  }

  private setStatus(status: NavigationStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private emitState(): void {
    const state = this.getState();
    const busState: NavigationState = {
      active: state.active,
      destinationLabel: state.destinationLabel,
      nextInstruction: state.nextInstruction,
      distanceMetersToStep: null,
      bearingDegrees: null,
      rerouteRequired: false,
    };
    this.bus.emit({ type: "navigation", state: busState });
    for (const listener of this.obstacleListeners) {
      listener(this.obstacles);
    }
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }
}
