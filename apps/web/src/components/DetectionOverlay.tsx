import type { DetectedObject } from "@mara/shared";
import { useEffect, useRef } from "react";

export function DetectionBoxes({
  tracks,
  enabled,
}: {
  tracks: DetectedObject[];
  enabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "#0c5c6e";
    context.lineWidth = 3;
    context.font = "16px Atkinson Hyperlegible, sans-serif";
    for (const track of tracks) {
      const x = track.box.x * width;
      const y = track.box.y * height;
      const w = track.box.w * width;
      const h = track.box.h * height;
      context.strokeRect(x, y, w, h);
      const caption = track.label;
      context.fillStyle = "#0c5c6e";
      context.fillRect(x, Math.max(0, y - 22), context.measureText(caption).width + 8, 22);
      context.fillStyle = "#ffffff";
      context.fillText(caption, x + 4, Math.max(16, y - 6));
    }
  }, [tracks, enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={960}
      height={540}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}

export function TrackList({ tracks }: { tracks: DetectedObject[] }) {
  if (tracks.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-2" aria-label="Current tracks">
      {tracks.map((track) => (
        <li
          key={track.trackId}
          className="border border-border bg-surface px-4 py-2 text-lg"
        >
          {track.label}, {track.zone}, {track.depth}
          {track.motion !== "unknown" ? `, ${track.motion}` : ""}.
        </li>
      ))}
    </ul>
  );
}
