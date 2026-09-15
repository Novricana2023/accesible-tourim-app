import { boxIou, type Box } from "./iou";
import type { RawDetection } from "./DetectionProvider";

export function nonMaxSuppression(
  detections: RawDetection[],
  iouThreshold = 0.45,
): RawDetection[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: RawDetection[] = [];

  for (const candidate of sorted) {
    const overlaps = kept.some(
      (keptDet) =>
        keptDet.label === candidate.label &&
        boxIou(keptDet.box, candidate.box) >= iouThreshold,
    );
    if (!overlaps) {
      kept.push(candidate);
    }
  }
  return kept;
}

export function clipBox(box: Box): Box {
  const x = Math.min(1, Math.max(0, box.x));
  const y = Math.min(1, Math.max(0, box.y));
  const w = Math.min(1 - x, Math.max(0, box.w));
  const h = Math.min(1 - y, Math.max(0, box.h));
  return { x, y, w, h };
}
