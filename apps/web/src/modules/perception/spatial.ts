import type { DepthBand, HorizontalZone } from "@mara/shared";

export interface SpatialState {
  zone: HorizontalZone;
  depth: DepthBand;
}

const ZONE_LEFT = 0.38;
const ZONE_RIGHT = 0.62;
const ZONE_LEFT_EXIT = 0.42;
const ZONE_RIGHT_EXIT = 0.58;

const DEPTH_NEAR = 0.12;
const DEPTH_MID = 0.035;
const DEPTH_NEAR_EXIT = 0.08;
const DEPTH_MID_EXIT = 0.022;

export function zoneFromBox(
  box: { x: number; y: number; w: number; h: number },
  previous?: HorizontalZone,
): HorizontalZone {
  const cx = box.x + box.w / 2;
  if (previous === "left" && cx < ZONE_LEFT_EXIT) {
    return "left";
  }
  if (previous === "right" && cx > ZONE_RIGHT_EXIT) {
    return "right";
  }
  if (previous === "center" && cx >= ZONE_LEFT && cx <= ZONE_RIGHT) {
    return "center";
  }
  if (cx < ZONE_LEFT) {
    return "left";
  }
  if (cx > ZONE_RIGHT) {
    return "right";
  }
  return "center";
}

export function depthFromBox(
  box: { x: number; y: number; w: number; h: number },
  previous?: DepthBand,
): DepthBand {
  const area = Math.max(0, box.w) * Math.max(0, box.h);
  if (previous === "near" && area >= DEPTH_NEAR_EXIT) {
    return "near";
  }
  if (previous === "far" && area <= DEPTH_MID) {
    return "far";
  }
  if (previous === "mid" && area < DEPTH_NEAR && area > DEPTH_MID_EXIT) {
    return "mid";
  }
  if (area >= DEPTH_NEAR) {
    return "near";
  }
  if (area >= DEPTH_MID) {
    return "mid";
  }
  return "far";
}

export function describeSpatial(
  box: { x: number; y: number; w: number; h: number },
  previous?: SpatialState,
): SpatialState {
  return {
    zone: zoneFromBox(box, previous?.zone),
    depth: depthFromBox(box, previous?.depth),
  };
}
