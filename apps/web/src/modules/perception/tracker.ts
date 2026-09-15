import type { DetectedObject } from "@mara/shared";
import { boxIou } from "./iou";
import { motionFromHistory, type MotionSample } from "./motion";
import type { RawDetection } from "./DetectionProvider";
import { describeSpatial, type SpatialState } from "./spatial";

export interface TrackerOptions {
  iouThreshold?: number;
  maxLostMs?: number;
}

interface InternalTrack {
  id: string;
  label: string;
  box: { x: number; y: number; w: number; h: number };
  confidence: number;
  hits: number;
  firstSeenMs: number;
  lastSeenMs: number;
  spatial: SpatialState;
  history: MotionSample[];
}

export class IoUTracker {
  private readonly iouThreshold: number;
  private readonly maxLostMs: number;
  private readonly tracks = new Map<string, InternalTrack>();
  private nextId = 1;

  constructor(options: TrackerOptions = {}) {
    this.iouThreshold = options.iouThreshold ?? 0.3;
    this.maxLostMs = options.maxLostMs ?? 300;
  }

  reset(): void {
    this.tracks.clear();
    this.nextId = 1;
  }

  update(detections: RawDetection[], now: number): DetectedObject[] {
    const unmatchedTracks = new Set(this.tracks.keys());
    const unmatchedDetections = detections.map((_, index) => index);
    const assignments: Array<{ trackId: string; detIndex: number }> = [];

    const pairs: Array<{ trackId: string; detIndex: number; iou: number }> = [];
    for (const track of this.tracks.values()) {
      detections.forEach((detection, detIndex) => {
        if (detection.label !== track.label) {
          return;
        }
        const iou = boxIou(track.box, detection.box);
        if (iou >= this.iouThreshold) {
          pairs.push({ trackId: track.id, detIndex, iou });
        }
      });
    }
    pairs.sort((a, b) => b.iou - a.iou);

    const usedDets = new Set<number>();
    const usedTracks = new Set<string>();
    for (const pair of pairs) {
      if (usedDets.has(pair.detIndex) || usedTracks.has(pair.trackId)) {
        continue;
      }
      usedDets.add(pair.detIndex);
      usedTracks.add(pair.trackId);
      unmatchedTracks.delete(pair.trackId);
      assignments.push({ trackId: pair.trackId, detIndex: pair.detIndex });
    }

    for (const assignment of assignments) {
      const detection = detections[assignment.detIndex];
      this.touch(assignment.trackId, detection, now);
    }

    for (const detIndex of unmatchedDetections) {
      if (usedDets.has(detIndex)) {
        continue;
      }
      this.create(detections[detIndex], now);
    }

    for (const trackId of unmatchedTracks) {
      const track = this.tracks.get(trackId);
      if (!track) {
        continue;
      }
      if (now - track.lastSeenMs > this.maxLostMs) {
        this.tracks.delete(trackId);
      }
    }

    return [...this.tracks.values()].map((track) => this.toDetected(track, now));
  }

  private create(detection: RawDetection, now: number): void {
    const id = String(this.nextId);
    this.nextId += 1;
    const spatial = describeSpatial(detection.box);
    const sample = sampleFromBox(detection.box, now);
    this.tracks.set(id, {
      id,
      label: detection.label,
      box: detection.box,
      confidence: detection.confidence,
      hits: 1,
      firstSeenMs: now,
      lastSeenMs: now,
      spatial,
      history: [sample],
    });
  }

  private touch(trackId: string, detection: RawDetection, now: number): void {
    const track = this.tracks.get(trackId);
    if (!track) {
      return;
    }
    track.box = detection.box;
    track.confidence = detection.confidence;
    track.hits += 1;
    track.lastSeenMs = now;
    track.spatial = describeSpatial(detection.box, track.spatial);
    track.history.push(sampleFromBox(detection.box, now));
    track.history = track.history.filter((sample) => now - sample.t <= 1200);
  }

  private toDetected(track: InternalTrack, now: number): DetectedObject {
    return {
      trackId: track.id,
      label: track.label,
      confidence: track.confidence,
      box: track.box,
      zone: track.spatial.zone,
      depth: track.spatial.depth,
      motion: motionFromHistory(track.history, now),
      firstSeenMs: track.firstSeenMs,
      lastSeenMs: track.lastSeenMs,
    };
  }
}

function sampleFromBox(
  box: { x: number; y: number; w: number; h: number },
  t: number,
): MotionSample {
  return {
    t,
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    area: Math.max(0, box.w) * Math.max(0, box.h),
  };
}
