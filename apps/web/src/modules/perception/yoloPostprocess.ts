import type { RawDetection } from "./DetectionProvider";
import { clipBox, nonMaxSuppression } from "./nms";

export interface LetterboxMeta {
  scale: number;
  padX: number;
  padY: number;
  inputSize: number;
  sourceWidth: number;
  sourceHeight: number;
}

export function decodeYoloOutput(
  data: Float32Array,
  dims: readonly number[],
  labels: readonly string[],
  scoreThreshold: number,
  letterbox: LetterboxMeta,
): RawDetection[] {
  const candidates = collectCandidates(data, dims, labels, scoreThreshold);
  const mapped = candidates.map((item) => ({
    ...item,
    box: letterboxToNormalized(item.cx, item.cy, item.w, item.h, letterbox),
  }));
  return nonMaxSuppression(mapped);
}

interface Candidate {
  label: string;
  confidence: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

function collectCandidates(
  data: Float32Array,
  dims: readonly number[],
  labels: readonly string[],
  scoreThreshold: number,
): Candidate[] {
  const flat = dims[0] === 1 ? dims.slice(1) : dims;

  if (flat.length === 2 && (flat[1] === 6 || flat[1] === 5)) {
    return decodeNmsRows(data, flat[0], flat[1], labels, scoreThreshold);
  }

  if (flat.length === 2 && flat[0] === 84) {
    return decodeTransposed(data, flat[1], labels, scoreThreshold);
  }

  if (flat.length === 2 && flat[1] === 84) {
    return decodeRows(data, flat[0], labels, scoreThreshold);
  }

  return [];
}

function decodeTransposed(
  data: Float32Array,
  count: number,
  labels: readonly string[],
  scoreThreshold: number,
): Candidate[] {
  const results: Candidate[] = [];
  for (let i = 0; i < count; i += 1) {
    const cx = data[i];
    const cy = data[count + i];
    const w = data[2 * count + i];
    const h = data[3 * count + i];
    let best = 0;
    let bestScore = 0;
    for (let c = 0; c < labels.length; c += 1) {
      const score = data[(4 + c) * count + i];
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (bestScore < scoreThreshold) {
      continue;
    }
    const label = labels[best];
    if (!label) {
      continue;
    }
    results.push({ label, confidence: bestScore, cx, cy, w, h });
  }
  return results;
}

function decodeRows(
  data: Float32Array,
  count: number,
  labels: readonly string[],
  scoreThreshold: number,
): Candidate[] {
  const stride = 84;
  const results: Candidate[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = i * stride;
    const cx = data[offset];
    const cy = data[offset + 1];
    const w = data[offset + 2];
    const h = data[offset + 3];
    let best = 0;
    let bestScore = 0;
    for (let c = 0; c < labels.length; c += 1) {
      const score = data[offset + 4 + c];
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (bestScore < scoreThreshold) {
      continue;
    }
    const label = labels[best];
    if (!label) {
      continue;
    }
    results.push({ label, confidence: bestScore, cx, cy, w, h });
  }
  return results;
}

function decodeNmsRows(
  data: Float32Array,
  count: number,
  stride: number,
  labels: readonly string[],
  scoreThreshold: number,
): Candidate[] {
  const results: Candidate[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = i * stride;
    const x1 = data[offset];
    const y1 = data[offset + 1];
    const x2 = data[offset + 2];
    const y2 = data[offset + 3];
    const confidence = data[offset + 4];
    const classIndex = stride === 6 ? Math.round(data[offset + 5]) : 0;
    if (confidence < scoreThreshold) {
      continue;
    }
    const label = labels[classIndex];
    if (!label) {
      continue;
    }
    results.push({
      label,
      confidence,
      cx: (x1 + x2) / 2,
      cy: (y1 + y2) / 2,
      w: Math.max(0, x2 - x1),
      h: Math.max(0, y2 - y1),
    });
  }
  return results;
}

function letterboxToNormalized(
  cx: number,
  cy: number,
  w: number,
  h: number,
  letterbox: LetterboxMeta,
): { x: number; y: number; w: number; h: number } {
  const x1 = (cx - w / 2 - letterbox.padX) / letterbox.scale;
  const y1 = (cy - h / 2 - letterbox.padY) / letterbox.scale;
  const x2 = (cx + w / 2 - letterbox.padX) / letterbox.scale;
  const y2 = (cy + h / 2 - letterbox.padY) / letterbox.scale;
  return clipBox({
    x: x1 / letterbox.sourceWidth,
    y: y1 / letterbox.sourceHeight,
    w: (x2 - x1) / letterbox.sourceWidth,
    h: (y2 - y1) / letterbox.sourceHeight,
  });
}
