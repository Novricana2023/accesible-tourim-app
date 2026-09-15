import type { MotionHint } from "@mara/shared";

export interface MotionSample {
  t: number;
  cx: number;
  cy: number;
  area: number;
}

const WINDOW_MS = 1000;
const AREA_GROW = 0.25;
const AREA_SHRINK = 0.25;
const CROSS_DX = 0.12;
const STILL = 0.03;

export function motionFromHistory(history: MotionSample[], now: number): MotionHint {
  const recent = history.filter((sample) => now - sample.t <= WINDOW_MS);
  if (recent.length < 2) {
    return "unknown";
  }

  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  if (dt < 250) {
    return "unknown";
  }

  const areaRatio = first.area > 1e-6 ? last.area / first.area : 1;
  const dx = last.cx - first.cx;
  const dy = last.cy - first.cy;
  const travel = Math.hypot(dx, dy);
  const crossedCenter =
    (first.cx < 0.45 && last.cx > 0.55) || (first.cx > 0.55 && last.cx < 0.45);

  if (crossedCenter && Math.abs(dx) >= CROSS_DX) {
    return "crossing";
  }
  if (areaRatio >= 1 + AREA_GROW) {
    return "approaching";
  }
  if (areaRatio <= 1 - AREA_SHRINK) {
    return "receding";
  }
  if (travel < STILL && Math.abs(areaRatio - 1) < 0.1) {
    return "stationary";
  }
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= CROSS_DX) {
    return "crossing";
  }
  return "unknown";
}
