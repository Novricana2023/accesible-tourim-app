import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CameraService } from "@/modules/camera/CameraService";
import { useCamera } from "@/modules/camera/useCamera";
import {
  createMockStream,
  createMockTrack,
  createMockVideo,
  defaultRequest,
} from "./mocks";

function createService(
  getUserMedia: ReturnType<typeof vi.fn>,
) {
  return new CameraService({
    autoCapture: false,
    isSecureContext: () => true,
    createVideo: createMockVideo,
    enumerateDevices: async () => [],
    getUserMedia,
  });
}

describe("useCamera", () => {
  it("stops tracks when the hook unmounts", async () => {
    const track = createMockTrack();
    const service = createService(
      vi.fn().mockResolvedValue(createMockStream([track])),
    );

    const { unmount } = renderHook(() => useCamera(service));
    await act(async () => {
      await service.request(defaultRequest);
    });
    expect(track.stop).not.toHaveBeenCalled();

    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(track.stop).toHaveBeenCalled();
    expect(service.getStatus()).toBe("idle");
  });

  it("does not stop tracks on unmount when stopOnUnmount is false", async () => {
    const track = createMockTrack();
    const service = createService(
      vi.fn().mockResolvedValue(createMockStream([track])),
    );

    const { unmount } = renderHook(() =>
      useCamera(service, { stopOnUnmount: false }),
    );
    await act(async () => {
      await service.request(defaultRequest);
    });
    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(track.stop).not.toHaveBeenCalled();
    expect(service.getStatus()).toBe("live");
    await service.stop();
  });
});
