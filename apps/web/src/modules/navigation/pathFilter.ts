import type { DetectedObject } from "@mara/shared";
import type { PathObstacle, PathObstaclePriority } from "./types";

const PERSON_LABELS = new Set(["person"]);

const VEHICLE_LABELS = new Set([
  "bicycle",
  "car",
  "motorcycle",
  "bus",
  "truck",
]);

const LARGE_LABELS = new Set([
  "bench",
  "chair",
  "couch",
  "bed",
  "dining table",
  "toilet",
  "tv",
  "refrigerator",
  "potted plant",
  "suitcase",
]);

/** Normalized box area that counts as a large obstacle when the class is generic. */
export const LARGE_AREA = 0.1;

const PRIORITY_ORDER: Record<PathObstaclePriority, number> = {
  person: 0,
  vehicle: 1,
  large: 2,
  other: 3,
};

const DEPTH_ORDER: Record<DetectedObject["depth"], number> = {
  near: 0,
  mid: 1,
  far: 2,
};

export function normalizeNavLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function pathObstaclePriority(
  object: DetectedObject,
): PathObstaclePriority {
  const label = normalizeNavLabel(object.label);
  if (PERSON_LABELS.has(label)) {
    return "person";
  }
  if (VEHICLE_LABELS.has(label)) {
    return "vehicle";
  }
  const area = Math.max(0, object.box.w) * Math.max(0, object.box.h);
  if (LARGE_LABELS.has(label) || area >= LARGE_AREA) {
    return "large";
  }
  return "other";
}

/**
 * Keep objects that can reasonably sit in the walking path.
 * Drop far-side clutter: far anything, and mid left/right unless moving into the path.
 */
export function isPathRelevant(object: DetectedObject): boolean {
  if (object.depth === "far") {
    return false;
  }

  const inBand = object.depth === "near" || object.depth === "mid";
  if (!inBand) {
    return false;
  }

  if (object.zone === "center") {
    return true;
  }

  if (object.motion === "approaching" || object.motion === "crossing") {
    return true;
  }

  return object.depth === "near";
}

export function toPathObstacle(object: DetectedObject): PathObstacle {
  return {
    trackId: object.trackId,
    label: object.label,
    confidence: object.confidence,
    zone: object.zone,
    depth: object.depth,
    motion: object.motion,
    box: object.box,
    firstSeenMs: object.firstSeenMs,
    lastSeenMs: object.lastSeenMs,
    distanceMeters: null,
    depthSource: "bbox-area",
    priority: pathObstaclePriority(object),
  };
}

export function filterPathRelevant(objects: DetectedObject[]): PathObstacle[] {
  return objects.filter(isPathRelevant).map(toPathObstacle);
}

export function prioritizePathObstacles(obstacles: PathObstacle[]): PathObstacle[] {
  return [...obstacles].sort((left, right) => {
    const byClass = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    if (byClass !== 0) {
      return byClass;
    }
    const byDepth = DEPTH_ORDER[left.depth] - DEPTH_ORDER[right.depth];
    if (byDepth !== 0) {
      return byDepth;
    }
    return right.confidence - left.confidence;
  });
}
