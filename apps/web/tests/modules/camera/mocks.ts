import { vi } from "vitest";

export interface MockTrack {
  kind: string;
  id: string;
  label: string;
  readyState: MediaStreamTrackState;
  enabled: boolean;
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  getSettings: () => MediaTrackSettings;
}

export function createMockTrack(
  extras: Partial<MediaTrackSettings> = {},
): MockTrack {
  const track: MockTrack = {
    kind: "video",
    id: extras.deviceId ?? "track-1",
    label: "Mock Camera",
    readyState: "live",
    enabled: true,
    stop: vi.fn(function stop(this: MockTrack) {
      this.readyState = "ended";
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getSettings: () => ({
      facingMode: extras.facingMode ?? "environment",
      width: extras.width ?? 640,
      height: extras.height ?? 480,
      deviceId: extras.deviceId ?? "cam-1",
    }),
  };
  return track;
}

export function createMockStream(tracks: MockTrack[] = [createMockTrack()]) {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

export function createMockVideo(): HTMLVideoElement {
  return {
    muted: true,
    autoplay: true,
    playsInline: true,
    srcObject: null,
    videoWidth: 640,
    videoHeight: 480,
    readyState: 4,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    setAttribute: vi.fn(),
    requestVideoFrameCallback: undefined,
    cancelVideoFrameCallback: vi.fn(),
  } as unknown as HTMLVideoElement;
}

export function createMockBitmap(label = "bitmap"): ImageBitmap {
  return {
    width: 4,
    height: 4,
    close: vi.fn(),
    label,
  } as unknown as ImageBitmap;
}

export const defaultRequest = {
  facingMode: "environment" as const,
  width: 1280,
  height: 720,
  fps: 24,
};
