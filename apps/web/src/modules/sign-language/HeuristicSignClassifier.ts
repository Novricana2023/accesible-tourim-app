import type { LandmarkFrame, SignClassifier, SignClassifierResult } from "./types";

/** Shipped when ONNX weights are absent. Rough hand shapes only — not certified ASL. */
export class HeuristicSignClassifier implements SignClassifier {
  readonly id = "heuristic-isolated-sign";

  async load(): Promise<{ ok: true }> {
    return { ok: true };
  }

  async predict(sequence: LandmarkFrame[]): Promise<SignClassifierResult | null> {
    const frame = sequence.at(-1);
    if (!frame || frame.hands.length === 0) {
      return null;
    }

    const candidates: SignClassifierResult[] = [];

    if (frame.hands.length >= 2) {
      const help = scoreHelp(frame.hands[0], frame.hands[1]);
      if (help >= 0.78) {
        candidates.push({ gloss: "HELP", confidence: help });
      }
    }

    for (const hand of frame.hands) {
      const hello = scoreHello(hand);
      if (hello >= 0.78) {
        candidates.push({ gloss: "HELLO", confidence: hello });
      }
      const stop = scoreStop(hand);
      if (stop >= 0.78) {
        candidates.push({ gloss: "STOP", confidence: stop });
      }
      const yes = scoreYes(hand);
      if (yes >= 0.78) {
        candidates.push({ gloss: "YES", confidence: yes });
      }
      const no = scoreNo(hand);
      if (no >= 0.78) {
        candidates.push({ gloss: "NO", confidence: no });
      }
      const please = scorePlease(hand);
      if (please >= 0.78) {
        candidates.push({ gloss: "PLEASE", confidence: please });
      }
      const thank = scoreThankYou(hand);
      if (thank >= 0.78) {
        candidates.push({ gloss: "THANK-YOU", confidence: thank });
      }
    }

    if (candidates.length === 0) {
      return null;
    }
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates[0] ?? null;
  }

  async dispose(): Promise<void> {
    /* stateless */
  }
}

function scoreHelp(a: number[], b: number[]): number {
  const extA = averageExtension(a);
  const extB = averageExtension(b);
  const fist = Math.min(extA, extB);
  const palm = Math.max(extA, extB);
  if (fist > 0.58 || palm < 0.5) {
    return 0;
  }
  if (palm - fist < 0.15) {
    return 0;
  }
  return clamp01(0.76 + (palm - fist) * 0.5);
}

function scoreHello(hand: number[]): number {
  const ext = fingerExtensions(hand);
  const open =
    ext.index > 0.65 && ext.middle > 0.65 && ext.ring > 0.65 && ext.pinky > 0.55;
  if (!open) {
    return 0;
  }
  return clamp01(0.8 + ext.index * 0.15);
}

function scoreStop(hand: number[]): number {
  const ext = fingerExtensions(hand);
  const flat =
    ext.index > 0.7 &&
    ext.middle > 0.7 &&
    ext.ring > 0.65 &&
    ext.pinky > 0.6 &&
    ext.thumb > 0.45;
  if (!flat) {
    return 0;
  }
  const spread = palmWidth(hand);
  return clamp01(0.78 + spread * 0.2);
}

function scoreYes(hand: number[]): number {
  const ext = fingerExtensions(hand);
  if (ext.thumb < 0.7) {
    return 0;
  }
  if (ext.index > 0.55 || ext.middle > 0.55) {
    return 0;
  }
  return clamp01(0.8 + ext.thumb * 0.15);
}

function scoreNo(hand: number[]): number {
  const ext = fingerExtensions(hand);
  if (ext.index < 0.65 || ext.middle < 0.65) {
    return 0;
  }
  if (ext.ring > 0.55 || ext.pinky > 0.55) {
    return 0;
  }
  return clamp01(0.82);
}

function scorePlease(hand: number[]): number {
  const ext = fingerExtensions(hand);
  const flat = ext.index > 0.6 && ext.middle > 0.6 && ext.ring > 0.55 && ext.pinky > 0.5;
  const center = handCenter(hand);
  if (!flat || center.y > 0.55) {
    return 0;
  }
  return 0.8;
}

function scoreThankYou(hand: number[]): number {
  const ext = fingerExtensions(hand);
  const flat = ext.index > 0.55 && ext.middle > 0.55;
  const center = handCenter(hand);
  if (!flat || center.y > 0.42) {
    return 0;
  }
  return 0.79;
}

function fingerExtensions(hand: number[]): {
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
} {
  return {
    thumb: extension(hand, 4, 3),
    index: extension(hand, 8, 6),
    middle: extension(hand, 12, 10),
    ring: extension(hand, 16, 14),
    pinky: extension(hand, 20, 18),
  };
}

function averageExtension(hand: number[]): number {
  const ext = fingerExtensions(hand);
  return (ext.thumb + ext.index + ext.middle + ext.ring + ext.pinky) / 5;
}

function extension(hand: number[], tipIndex: number, pipIndex: number): number {
  const wrist = point(hand, 0);
  const tip = point(hand, tipIndex);
  const pip = point(hand, pipIndex);
  const full = dist(wrist, tip);
  const partial = dist(wrist, pip);
  if (partial <= 1e-4) {
    return 0;
  }
  return clamp01((full - partial) / partial);
}

function palmWidth(hand: number[]): number {
  const index = point(hand, 5);
  const pinky = point(hand, 17);
  return clamp01(dist(index, pinky) * 4);
}

function handCenter(hand: number[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 21; i += 1) {
    const p = point(hand, i);
    x += p.x;
    y += p.y;
  }
  return { x: x / 21, y: y / 21 };
}

function point(hand: number[], index: number): { x: number; y: number; z: number } {
  const offset = index * 3;
  return {
    x: hand[offset] ?? 0,
    y: hand[offset + 1] ?? 0,
    z: hand[offset + 2] ?? 0,
  };
}

function dist(
  a: { x: number; y: number; z?: number },
  b: { x: number; y: number; z?: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(dx, dy, dz);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
