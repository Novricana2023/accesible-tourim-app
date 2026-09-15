import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraService } from "./CameraService";
import type {
  CameraDeviceInfo,
  CameraError,
  CameraRequestOptions,
  CameraStatus,
} from "./types";

export interface UseCameraOptions {
  stopOnUnmount?: boolean;
}

export function useCamera(
  service: CameraService,
  options: UseCameraOptions = {},
) {
  const stopOnUnmount = options.stopOnUnmount ?? true;
  const [status, setStatus] = useState<CameraStatus>(() => service.getStatus());
  const [error, setError] = useState<CameraError | null>(() =>
    service.getLastError(),
  );
  const [devices, setDevices] = useState<CameraDeviceInfo[]>(() =>
    service.getDevices(),
  );
  const [stream, setStream] = useState<MediaStream | null>(() =>
    service.getStream(),
  );
  const [facingMode, setFacingMode] = useState<
    CameraRequestOptions["facingMode"] | null
  >(() => service.getOptions()?.facingMode ?? null);
  const [deviceId, setDeviceId] = useState<string | undefined>(
    () => service.getOptions()?.deviceId,
  );
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return service.subscribeStatus((nextStatus, nextError) => {
      setStatus(nextStatus);
      setError(nextError);
      setStream(service.getStream());
      setDevices(service.getDevices());
      setFacingMode(service.getOptions()?.facingMode ?? null);
      setDeviceId(service.getOptions()?.deviceId);
    });
  }, [service]);

  useEffect(() => {
    return () => {
      if (stopOnUnmount) {
        void service.stop();
      }
    };
  }, [service, stopOnUnmount]);

  useEffect(() => {
    const video = previewRef.current;
    if (!video) {
      return;
    }
    video.srcObject = stream;
    video.muted = true;
    if (stream) {
      void video.play().catch(() => {
        /* play is retried when the element is visible */
      });
    }
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  const request = useCallback(
    (requestOptions: CameraRequestOptions) => service.request(requestOptions),
    [service],
  );

  const reconfigure = useCallback(
    (patch: Partial<CameraRequestOptions>) => service.reconfigure(patch),
    [service],
  );

  const stop = useCallback(() => service.stop(), [service]);

  const switchFacing = useCallback(() => {
    const current = service.getOptions()?.facingMode ?? "environment";
    const next = current === "user" ? "environment" : "user";
    return service.reconfigure({ facingMode: next, deviceId: undefined });
  }, [service]);

  const selectDevice = useCallback(
    (deviceId: string) => service.reconfigure({ deviceId }),
    [service],
  );

  return {
    status,
    error,
    devices,
    stream,
    previewRef,
    facingMode,
    deviceId,
    request,
    reconfigure,
    stop,
    switchFacing,
    selectDevice,
  };
}
