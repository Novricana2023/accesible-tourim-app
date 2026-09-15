import { describe, expect, it, vi } from "vitest";
import { CameraService } from "@/modules/camera/CameraService";
import {
  createMockBitmap,
  createMockStream,
  createMockTrack,
  createMockVideo,
  defaultRequest,
} from "./mocks";

function createService(overrides: ConstructorParameters<typeof CameraService>[0] = {}) {
  return new CameraService({
    autoCapture: false,
    isSecureContext: () => true,
    createVideo: createMockVideo,
    enumerateDevices: async () => [],
    ...overrides,
  });
}

describe("CameraService", () => {
  it("request() becomes live when getUserMedia resolves", async () => {
    const track = createMockTrack();
    const getUserMedia = vi.fn().mockResolvedValue(createMockStream([track]));
    const service = createService({ getUserMedia });

    await service.request(defaultRequest);

    expect(service.getStatus()).toBe("live");
    expect(service.getLastError()).toBeNull();
    expect(service.getStream()).not.toBeNull();
    expect(getUserMedia).toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("maps NotAllowedError to denied", async () => {
    const error = Object.assign(new Error("Permission denied"), {
      name: "NotAllowedError",
    });
    const service = createService({
      getUserMedia: vi.fn().mockRejectedValue(error),
    });

    await expect(service.request(defaultRequest)).rejects.toBe(error);
    expect(service.getStatus()).toBe("denied");
    expect(service.getLastError()?.code).toBe("denied");
    expect(service.getStream()).toBeNull();
  });

  it("maps NotFoundError to unavailable", async () => {
    const error = Object.assign(new Error("No device"), { name: "NotFoundError" });
    const service = createService({
      getUserMedia: vi.fn().mockRejectedValue(error),
    });

    await expect(service.request(defaultRequest)).rejects.toBe(error);
    expect(service.getStatus()).toBe("unavailable");
    expect(service.getLastError()?.code).toBe("unavailable");
  });

  it("stop() stops all tracks and returns to idle", async () => {
    const track = createMockTrack();
    const service = createService({
      getUserMedia: vi.fn().mockResolvedValue(createMockStream([track])),
    });

    await service.request(defaultRequest);
    await service.stop();

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toBe("idle");
    expect(service.getStream()).toBeNull();
  });

  it("facing switch stops old tracks before starting the new stream", async () => {
    const oldTrack = createMockTrack({ deviceId: "rear" });
    const newTrack = createMockTrack({ deviceId: "front", facingMode: "user" });
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(createMockStream([oldTrack]))
      .mockResolvedValueOnce(createMockStream([newTrack]));
    const service = createService({ getUserMedia });

    await service.request(defaultRequest);
    expect(oldTrack.stop).not.toHaveBeenCalled();

    await service.reconfigure({ facingMode: "user" });

    expect(oldTrack.stop).toHaveBeenCalled();
    expect(newTrack.stop).not.toHaveBeenCalled();
    expect(service.getStatus()).toBe("live");
    expect(service.getOptions()?.facingMode).toBe("user");

    const firstCall = getUserMedia.mock.calls[0]?.[0] as MediaStreamConstraints;
    const secondCall = getUserMedia.mock.calls[1]?.[0] as MediaStreamConstraints;
    expect(firstCall.video).toEqual(expect.objectContaining({}));
    expect(
      (secondCall.video as MediaTrackConstraints).facingMode,
    ).toEqual({ ideal: "user" });
  });

  it("stop() during request releases a late-arriving stream", async () => {
    const track = createMockTrack();
    let release!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          release = resolve;
        }),
    );
    const service = createService({ getUserMedia });

    const pending = service.request(defaultRequest);
    await service.stop();
    release(createMockStream([track]));
    await pending;

    expect(track.stop).toHaveBeenCalled();
    expect(service.getStatus()).toBe("idle");
  });

  it("does not capture pixels when nothing is subscribed", async () => {
    const createImageBitmap = vi.fn(async () => createMockBitmap("cap"));
    const track = createMockTrack();
    const service = new CameraService({
      autoCapture: true,
      isSecureContext: () => true,
      createVideo: createMockVideo,
      enumerateDevices: async () => [],
      getUserMedia: vi.fn().mockResolvedValue(createMockStream([track])),
      createImageBitmap,
    });

    await service.request(defaultRequest);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(createImageBitmap).not.toHaveBeenCalled();
    await service.stop();
    expect(track.stop).toHaveBeenCalled();
  });

  it("mutes tracks when the tab is hidden and unmutes when it is visible", async () => {
    let hidden = false;
    const listeners = new Set<() => void>();
    const track = createMockTrack();
    const service = new CameraService({
      autoCapture: false,
      isSecureContext: () => true,
      createVideo: createMockVideo,
      enumerateDevices: async () => [],
      getUserMedia: vi.fn().mockResolvedValue(createMockStream([track])),
      visibility: {
        hidden: () => hidden,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    });

    await service.request(defaultRequest);
    expect(track.enabled).toBe(true);

    hidden = true;
    for (const listener of listeners) {
      listener();
    }
    expect(track.enabled).toBe(false);
    expect(track.stop).not.toHaveBeenCalled();

    hidden = false;
    for (const listener of listeners) {
      listener();
    }
    expect(track.enabled).toBe(true);

    await service.stop();
    expect(track.stop).toHaveBeenCalled();
  });
});
