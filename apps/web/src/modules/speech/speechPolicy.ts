import type {
  DetectedObject,
  SpeechRank,
  SpeechRequest,
  WarningEvent,
} from "@mara/shared";
import { createId } from "@/lib/utils";
import { HAZARD_LABELS } from "@/modules/perception/cocoLabels";
import {
  formatDetectionUtterance,
  formatWarningUtterance,
  isAccessClassLabel,
  normalizeLabel,
} from "./utterance";

export interface SceneSpeechOptions {
  minHitsMs?: number;
  safetyCooldownMs?: number;
  personVehicleCooldownMs?: number;
  accessCooldownMs?: number;
  sceneCooldownMs?: number;
  infoCooldownMs?: number;
  sceneRateLimitMs?: number;
}

const DEFAULTS = {
  minHitsMs: 120,
  safetyCooldownMs: 4000,
  personVehicleCooldownMs: 8000,
  accessCooldownMs: 8000,
  sceneCooldownMs: 12000,
  infoCooldownMs: 15000,
  sceneRateLimitMs: 4000,
};

function isHazardLabel(label: string): boolean {
  return HAZARD_LABELS.has(normalizeLabel(label));
}

export function rankDetection(object: DetectedObject): SpeechRank {
  const hazard = isHazardLabel(object.label);
  const approaching =
    object.motion === "approaching" &&
    (object.depth === "near" || object.depth === "mid");
  const crossingPath =
    object.motion === "crossing" && object.depth !== "far";

  if (hazard && (approaching || crossingPath)) {
    return 1;
  }
  if (hazard) {
    return 2;
  }
  if (isAccessClassLabel(object.label)) {
    return object.depth === "far" ? 5 : 3;
  }
  if (object.depth === "far") {
    return 5;
  }
  return 4;
}

function architecturePriority(rank: SpeechRank): SpeechRequest["priority"] {
  if (rank === 1) {
    return 0;
  }
  if (rank === 2) {
    return 1;
  }
  if (rank === 3) {
    return 1;
  }
  return 4;
}

function categoryFor(rank: SpeechRank): SpeechRequest["category"] {
  if (rank === 1) {
    return "hazard";
  }
  if (rank === 2) {
    return "safety";
  }
  return "scene";
}

export class SceneSpeechPolicy {
  private options: Required<SceneSpeechOptions>;
  private readonly lastSpoken = new Map<
    string,
    { at: number; depth: DetectedObject["depth"]; motion: DetectedObject["motion"] }
  >();
  private lastSceneUtteranceMs = Number.NEGATIVE_INFINITY;

  constructor(options: SceneSpeechOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  reset(): void {
    this.lastSpoken.clear();
    this.lastSceneUtteranceMs = Number.NEGATIVE_INFINITY;
  }

  updateOptions(patch: SceneSpeechOptions): void {
    this.options = { ...this.options, ...patch };
  }

  cooldownFor(rank: SpeechRank): number {
    if (rank === 1) {
      return this.options.safetyCooldownMs;
    }
    if (rank === 2) {
      return this.options.personVehicleCooldownMs;
    }
    if (rank === 3) {
      return this.options.accessCooldownMs;
    }
    if (rank === 4) {
      return this.options.sceneCooldownMs;
    }
    return this.options.infoCooldownMs;
  }

  requestFromObject(object: DetectedObject, now: number): SpeechRequest | null {
    if (object.lastSeenMs - object.firstSeenMs < this.options.minHitsMs) {
      return null;
    }

    const rank = rankDetection(object);
    const identity = `${object.trackId}:${normalizeLabel(object.label)}:${object.zone}`;
    const last = this.lastSpoken.get(identity);
    const refreshed =
      last !== undefined &&
      (last.depth !== object.depth || last.motion !== object.motion);
    const cooldown = this.cooldownFor(rank);

    if (last !== undefined && !refreshed && now - last.at < cooldown) {
      return null;
    }

    if (rank >= 4 && now - this.lastSceneUtteranceMs < this.options.sceneRateLimitMs) {
      return null;
    }

    this.lastSpoken.set(identity, {
      at: now,
      depth: object.depth,
      motion: object.motion,
    });
    if (rank >= 4) {
      this.lastSceneUtteranceMs = now;
    }

    return {
      id: createId(),
      priority: architecturePriority(rank),
      text: formatDetectionUtterance(object),
      interrupt: rank === 1,
      category: categoryFor(rank),
      dedupeKey: `${identity}:${object.depth}:${object.motion}`,
      cooldownMs: cooldown,
      createdMs: now,
      rank,
    };
  }

  requestsFromTracks(objects: DetectedObject[], now: number): SpeechRequest[] {
    const requests: SpeechRequest[] = [];
    for (const object of objects) {
      const request = this.requestFromObject(object, now);
      if (request) {
        requests.push(request);
      }
    }
    requests.sort((left, right) => (left.rank ?? 9) - (right.rank ?? 9));
    return requests;
  }

  requestFromWarning(warning: WarningEvent): SpeechRequest {
    const rank: SpeechRank =
      warning.code === "lost-track" ? 2 : warning.severity === 2 ? 2 : 1;
    return {
      id: warning.id,
      priority: architecturePriority(rank),
      text: formatWarningUtterance(warning),
      interrupt: rank === 1,
      category: categoryFor(rank),
      dedupeKey: `warning:${warning.trackId}:${normalizeLabel(warning.label)}:${warning.zone}:${warning.code}`,
      cooldownMs: this.cooldownFor(rank),
      createdMs: warning.createdMs,
      rank,
    };
  }
}
