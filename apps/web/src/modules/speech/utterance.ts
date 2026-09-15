import type { DetectedObject, WarningEvent } from "@mara/shared";

const VEHICLE_LABELS = new Set(["car", "bus", "truck", "motorcycle"]);

const ACCESS_SPOKEN: Record<string, string> = {
  door: "Door",
  doorway: "Door",
  stairs: "Stairs",
  stair: "Stairs",
  staircase: "Stairs",
};

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function isAccessClassLabel(label: string): boolean {
  return normalizeLabel(label) in ACCESS_SPOKEN;
}

export function isVehicleLabel(label: string): boolean {
  return VEHICLE_LABELS.has(normalizeLabel(label));
}

export function spokenName(label: string): string {
  const normalized = normalizeLabel(label);
  if (!normalized) {
    return "Object";
  }
  if (VEHICLE_LABELS.has(normalized)) {
    return "Vehicle";
  }
  const access = ACCESS_SPOKEN[normalized];
  if (access) {
    return access;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function formatDetectionUtterance(object: DetectedObject): string {
  const name = spokenName(object.label);

  if (object.motion === "approaching") {
    if (object.zone === "center") {
      return `${name} approaching ahead.`;
    }
    if (object.zone === "left") {
      return `${name} approaching from the left.`;
    }
    return `${name} approaching from the right.`;
  }

  if (object.motion === "crossing") {
    if (object.zone === "left") {
      return `${name} crossing from the left.`;
    }
    if (object.zone === "right") {
      return `${name} crossing from the right.`;
    }
    return `${name} crossing ahead.`;
  }

  if (object.zone === "center") {
    if (object.depth === "far") {
      return `${name} ahead, far.`;
    }
    return `${name} ahead.`;
  }

  if (object.zone === "left") {
    if (object.depth === "near") {
      return `${name} on the left.`;
    }
    if (object.depth === "far") {
      return `${name} far left.`;
    }
    return `${name} slightly left.`;
  }

  if (object.depth === "near") {
    return `${name} on the right.`;
  }
  if (object.depth === "far") {
    return `${name} far right.`;
  }
  return `${name} slightly right.`;
}

export function formatWarningUtterance(warning: WarningEvent): string {
  return formatDetectionUtterance({
    trackId: warning.trackId,
    label: warning.label,
    confidence: 1,
    box: { x: 0, y: 0, w: 0, h: 0 },
    zone: warning.zone,
    depth: warning.depth,
    motion:
      warning.code === "crossing-path"
        ? "crossing"
        : warning.code === "obstacle-approaching"
          ? "approaching"
          : "stationary",
    firstSeenMs: warning.createdMs,
    lastSeenMs: warning.createdMs,
  });
}
