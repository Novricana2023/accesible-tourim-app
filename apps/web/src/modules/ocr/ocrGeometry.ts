export interface OcrBox {
  text: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
}

export const MIN_OCR_CONFIDENCE = 0.55;
const MIN_BOX_AREA = 0.0004;
const MIN_BOX_HEIGHT = 0.012;

export function normalizeOcrText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function ocrDedupeKey(text: string): string {
  return normalizeOcrText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isUsefulOcrText(
  text: string,
  confidence: number,
  minConfidence = MIN_OCR_CONFIDENCE,
): boolean {
  if (confidence < minConfidence) {
    return false;
  }
  const normalized = normalizeOcrText(text);
  if (normalized.length < 2) {
    return false;
  }
  return /[\p{L}\p{N}]/u.test(normalized);
}

function area(box: OcrBox["box"]): number {
  return Math.max(0, box.w) * Math.max(0, box.h);
}

function isTiny(box: OcrBox["box"]): boolean {
  return area(box) < MIN_BOX_AREA || box.h < MIN_BOX_HEIGHT;
}

function overlapsOrNear(left: OcrBox, right: OcrBox, xGap: number, yGap: number): boolean {
  const a = left.box;
  const b = right.box;
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const xOverlap = Math.min(ax2, bx2) - Math.max(a.x, b.x);
  const yOverlap = Math.min(ay2, by2) - Math.max(a.y, b.y);
  const xClose = xOverlap >= -xGap;
  const yClose = yOverlap >= -yGap;
  return xClose && yClose;
}

function mergeCluster(cluster: OcrBox[]): OcrBox {
  const sorted = [...cluster].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const text = normalizeOcrText(sorted.map((item) => item.text).join(" "));
  const x = Math.min(...sorted.map((item) => item.box.x));
  const y = Math.min(...sorted.map((item) => item.box.y));
  const x2 = Math.max(...sorted.map((item) => item.box.x + item.box.w));
  const y2 = Math.max(...sorted.map((item) => item.box.y + item.box.h));
  const weight = sorted.reduce((sum, item) => sum + Math.max(item.confidence, 0) * area(item.box), 0);
  const weightArea = sorted.reduce((sum, item) => sum + area(item.box), 0);
  return {
    text,
    confidence: weightArea > 0 ? weight / weightArea : 0,
    box: { x, y, w: x2 - x, h: y2 - y },
  };
}

export function dropLowConfidence(
  regions: OcrBox[],
  minConfidence = MIN_OCR_CONFIDENCE,
): OcrBox[] {
  return regions.filter(
    (region) =>
      !isTiny(region.box) && isUsefulOcrText(region.text, region.confidence, minConfidence),
  );
}

export function mergeNearbyRegions(
  regions: OcrBox[],
  xGap = 0.04,
  yGap = 0.03,
): OcrBox[] {
  const usable = dropLowConfidence(regions);
  usable.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const clusters: OcrBox[][] = [];
  for (const region of usable) {
    let attached = false;
    for (let index = clusters.length - 1; index >= 0; index -= 1) {
      const cluster = clusters[index];
      if (cluster.some((prev) => overlapsOrNear(prev, region, xGap, yGap))) {
        cluster.push(region);
        attached = true;
        break;
      }
    }
    if (!attached) {
      clusters.push([region]);
    }
  }
  return clusters
    .map(mergeCluster)
    .filter((region) => isUsefulOcrText(region.text, region.confidence))
    .sort((a, b) => area(b.box) * b.confidence - area(a.box) * a.confidence);
}

export function selectReadableText(regions: OcrBox[], maxChars = 240): string {
  const top = regions[0];
  if (!top) {
    return "";
  }
  const text = normalizeOcrText(top.text);
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars).trimEnd();
}
