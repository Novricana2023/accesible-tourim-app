import type { DetectedObject, SpeechRank, SpeechRequest } from "@mara/shared";
import { createId } from "@/lib/utils";
import { formatDetectionUtterance } from "@/modules/speech/utterance";
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

function pathObstacleAsDetection(obstacle: PathObstacle): DetectedObject {
  return {
    trackId: obstacle.trackId,
    label: obstacle.label,
    confidence: obstacle.confidence,
    box: obstacle.box,
    zone: obstacle.zone,
    depth: obstacle.depth,
    motion: obstacle.motion,
    firstSeenMs: obstacle.firstSeenMs,
    lastSeenMs: obstacle.lastSeenMs,
  };
}

export function formatPathUtterance(obstacle: PathObstacle): string {
  return formatDetectionUtterance(pathObstacleAsDetection(obstacle));
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

  private planObstacle(
    obstacle: PathObstacle,
    now: number,
  ): { request: SpeechRequest; identity: string } | null {
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

    const text = formatPathUtterance(obstacle);
    if (utteranceContainsMeters(text)) {
      return null;
    }

    const ranked = navPriority(obstacle);
    return {
      identity,
      request: {
        id: createId(),
        priority: ranked.priority,
        text,
        interrupt: ranked.interrupt,
        category: "nav",
        dedupeKey: `nav:${identity}:${obstacle.depth}:${obstacle.motion}`,
        cooldownMs: cooldown,
        createdMs: now,
        rank: ranked.rank,
      },
    };
  }

  private markObstacleSpoken(
    identity: string,
    obstacle: PathObstacle,
    now: number,
  ): void {
    this.lastSpoken.set(identity, {
      at: now,
      depth: obstacle.depth,
      motion: obstacle.motion,
    });
  }

  requestFromObstacle(obstacle: PathObstacle, now: number): SpeechRequest | null {
    if (now - this.lastNavUtteranceMs < this.options.rateLimitMs) {
      return null;
    }
    const planned = this.planObstacle(obstacle, now);
    if (!planned) {
      return null;
    }
    this.markObstacleSpoken(planned.identity, obstacle, now);
    this.lastNavUtteranceMs = now;
    return planned.request;
  }

  /**
   * Summarize up to three prioritized obstacles in one utterance when allowed.
   * Never invents a "path is safe" line.
   */
  requestsFromObstacles(obstacles: PathObstacle[], now: number): SpeechRequest[] {
    if (obstacles.length === 0) {
      return [];
    }
    if (now - this.lastNavUtteranceMs < this.options.rateLimitMs) {
      return [];
    }

    const phrases: string[] = [];
    const seenPhrase = new Set<string>();
    let bestRank: SpeechRank = 3;
    let bestPriority: SpeechRequest["priority"] = 3;
    let interrupt = false;
    const dedupeParts: string[] = [];

    for (const obstacle of obstacles.slice(0, 4)) {
      if (phrases.length >= 3) {
        break;
      }
      const planned = this.planObstacle(obstacle, now);
      if (!planned) {
        continue;
      }
      const { request } = planned;
      const phrase = request.text.replace(/\.\s*$/, "").trim();
      if (!phrase || seenPhrase.has(phrase)) {
        continue;
      }
      seenPhrase.add(phrase);
      phrases.push(phrase);
      dedupeParts.push(request.dedupeKey ?? request.id);
      this.markObstacleSpoken(planned.identity, obstacle, now);
      const rank = request.rank ?? 3;
      if (rank < bestRank) {
        bestRank = rank;
      }
      if (request.priority < bestPriority) {
        bestPriority = request.priority;
      }
      if (request.interrupt) {
        interrupt = true;
      }
    }

    if (phrases.length === 0) {
      return [];
    }

    const text = `${phrases.join(". ")}.`;
    if (utteranceContainsMeters(text)) {
      return [];
    }

    this.lastNavUtteranceMs = now;

    const ranked = navPriority(obstacles[0]);
    return [
      {
        id: createId(),
        priority: bestPriority,
        text,
        interrupt,
        category: "nav",
        dedupeKey: `nav:summary:${dedupeParts.join("|")}`,
        cooldownMs: this.options.rateLimitMs,
        createdMs: now,
        rank: bestRank === 3 ? ranked.rank : bestRank,
      },
    ];
  }
}
