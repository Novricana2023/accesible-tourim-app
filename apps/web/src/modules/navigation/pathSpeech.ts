import type { SpeechRequest } from "@mara/shared";
import { createId } from "@/lib/utils";
import type { PathObstacle, PathObstaclePriority } from "./types";
import { normalizeNavLabel } from "./pathFilter";

export interface PathSpeechOptions {
  minHitsMs?: number;
  personVehicleCooldownMs?: number;
  largeCooldownMs?: number;
  otherCooldownMs?: number;
  rateLimitMs?: number;
}

const DEFAULTS: Required<PathSpeechOptions> = {
  minHitsMs: 120,
  personVehicleCooldownMs: 8000,
  largeCooldownMs: 10000,
  otherCooldownMs: 14000,
  rateLimitMs: 5000,
};

const VEHICLE_SPOKEN = new Set(["car", "bus", "truck", "motorcycle"]);

const METER_PATTERN = /\d+(?:\.\d+)?\s*(?:m|meter|meters|metre|metres)\b/i;

export function spokenPathName(label: string): string {
  const normalized = normalizeNavLabel(label);
  if (!normalized) {
    return "Object";
  }
  if (VEHICLE_SPOKEN.has(normalized)) {
    return "Vehicle";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function formatPathUtterance(obstacle: PathObstacle): string {
  const name = spokenPathName(obstacle.label);
  const zone = obstacle.zone;
  const depth = obstacle.depth;

  if (obstacle.motion === "approaching") {
    return `${name} approaching, ${zone}, ${depth}.`;
  }
  if (obstacle.motion === "crossing") {
    return `${name} crossing, ${zone}, ${depth}.`;
  }
  return `${name}, ${zone}, ${depth}.`;
}

export function utteranceContainsMeters(text: string): boolean {
  return METER_PATTERN.test(text);
}

function cooldownFor(
  priority: PathObstaclePriority,
  options: Required<PathSpeechOptions>,
): number {
  if (priority === "person" || priority === "vehicle") {
    return options.personVehicleCooldownMs;
  }
  if (priority === "large") {
    return options.largeCooldownMs;
  }
  return options.otherCooldownMs;
}

function navPriority(obstacle: PathObstacle): {
  priority: SpeechRequest["priority"];
  interrupt: boolean;
  rank: 1 | 2 | 3;
} {
  const movingIn =
    obstacle.motion === "approaching" || obstacle.motion === "crossing";
  const highClass = obstacle.priority === "person" || obstacle.priority === "vehicle";

  if (highClass && movingIn && obstacle.depth === "near") {
    return { priority: 0, interrupt: true, rank: 1 };
  }
  if (highClass && (obstacle.depth === "near" || movingIn)) {
    return { priority: 1, interrupt: false, rank: 2 };
  }
  return { priority: 3, interrupt: false, rank: 3 };
}

export class PathSpeechPolicy {
  private readonly options: Required<PathSpeechOptions>;
  private readonly lastSpoken = new Map<
    string,
    { at: number; depth: PathObstacle["depth"]; motion: PathObstacle["motion"] }
  >();
  private lastNavUtteranceMs = Number.NEGATIVE_INFINITY;

  constructor(options: PathSpeechOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  reset(): void {
    this.lastSpoken.clear();
    this.lastNavUtteranceMs = Number.NEGATIVE_INFINITY;
  }

  requestFromObstacle(obstacle: PathObstacle, now: number): SpeechRequest | null {
    if (obstacle.lastSeenMs - obstacle.firstSeenMs < this.options.minHitsMs) {
      return null;
    }

    const identity = `${obstacle.trackId}:${normalizeNavLabel(obstacle.label)}:${obstacle.zone}`;
    const last = this.lastSpoken.get(identity);
    const refreshed =
      last !== undefined &&
      (last.depth !== obstacle.depth || last.motion !== obstacle.motion);
    const cooldown = cooldownFor(obstacle.priority, this.options);

    if (last !== undefined && !refreshed && now - last.at < cooldown) {
      return null;
    }

    if (now - this.lastNavUtteranceMs < this.options.rateLimitMs) {
      return null;
    }

    const text = formatPathUtterance(obstacle);
    if (utteranceContainsMeters(text)) {
      return null;
    }

    this.lastSpoken.set(identity, {
      at: now,
      depth: obstacle.depth,
      motion: obstacle.motion,
    });
    this.lastNavUtteranceMs = now;

    const ranked = navPriority(obstacle);
    return {
      id: createId(),
      priority: ranked.priority,
      text,
      interrupt: ranked.interrupt,
      category: "nav",
      dedupeKey: `nav:${identity}:${obstacle.depth}:${obstacle.motion}`,
      cooldownMs: cooldown,
      createdMs: now,
      rank: ranked.rank,
    };
  }

  /**
   * Speak at most the highest-priority path obstacle. Never invents a "path is safe" line.
   */
  requestsFromObstacles(obstacles: PathObstacle[], now: number): SpeechRequest[] {
    if (obstacles.length === 0) {
      return [];
    }
    const request = this.requestFromObstacle(obstacles[0], now);
    return request ? [request] : [];
  }
}
