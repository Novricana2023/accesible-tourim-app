import type { CameraFrame } from "@mara/shared";
import { mapCameraError, messageFor, statusFor } from "./cameraErrors";
import { FrameBus, type FrameBusDeps } from "./FrameBus";
import type {
  CameraDeviceInfo,
  CameraError,
  CameraRequestOptions,
  CameraStatus,
  CameraStatusListener,
  FacingMode,
} from "./types";

export interface VisibilitySource {
  hidden(): boolean;
  subscribe(listener: () => void): () => void;
}

export interface CameraServiceDeps extends FrameBusDeps {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  enumerateDevices?: () => Promise<MediaDeviceInfo[]>;
  createVideo?: () => HTMLVideoElement;
  isSecureContext?: () => boolean;
  autoCapture?: boolean;
  visibility?: VisibilitySource;
}

function defaultCreateVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  return video;
}

function defaultVisibility(): VisibilitySource {
  return {
    hidden: () => typeof document !== "undefined" && document.hidden,
    subscribe: (listener) => {
      if (typeof document === "undefined") {
        return () => {
          /* no document */
        };
      }
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

export function captureSize(
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
): { width: number; height: number } {
  const edge = Math.max(sourceWidth, sourceHeight);
  if (!Number.isFinite(maxEdge) || maxEdge <= 0 || edge <= maxEdge) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export class CameraService {
  private readonly bus: FrameBus;
  private readonly getUserMediaFn: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;
  private readonly enumerateDevicesFn: () => Promise<MediaDeviceInfo[]>;
  private readonly createVideoFn: () => HTMLVideoElement;
  private readonly isSecureContextFn: () => boolean;
  private readonly autoCapture: boolean;
  private readonly now: () => number;
  private readonly createImageBitmapFn: NonNullable<FrameBusDeps["createImageBitmap"]>;
  private readonly visibility: VisibilitySource;

  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null =
    null;
  private status: CameraStatus = "idle";
  private lastError: CameraError | null = null;
  private options: CameraRequestOptions | null = null;
  private devices: CameraDeviceInfo[] = [];
  private readonly listeners = new Set<CameraStatusListener>();
  private requestGeneration = 0;
  private frameId = 0;
  private captureHandle: number | null = null;
  private captureMode: "rvfc" | "raf" | null = null;
  private endedHandlers: Array<{ track: MediaStreamTrack; handler: () => void }> =
    [];
  private capturing = false;
  private captureMaxEdge = 640;
  private readonly captureBudgets = new Map<string, number>();
  private keepCaptureInBackground = false;
  private unsubVisibility: (() => void) | null = null;
  private tracksMuted = false;

  constructor(deps: CameraServiceDeps = {}) {
    this.createImageBitmapFn =
      deps.createImageBitmap ??
      ((image, options) =>
        options ? createImageBitmap(image, options) : createImageBitmap(image));
    this.bus = new FrameBus({
      createImageBitmap: this.createImageBitmapFn,
      now: deps.now,
    });
    this.getUserMediaFn =
      deps.getUserMedia ??
      ((constraints) => navigator.mediaDevices.getUserMedia(constraints));
    this.enumerateDevicesFn =
      deps.enumerateDevices ?? (() => navigator.mediaDevices.enumerateDevices());
    this.createVideoFn = deps.createVideo ?? defaultCreateVideo;
    this.isSecureContextFn =
      deps.isSecureContext ?? (() => window.isSecureContext);
    this.autoCapture = deps.autoCapture ?? true;
    this.now = deps.now ?? (() => performance.now());
    this.visibility = deps.visibility ?? defaultVisibility();
    this.bus.onSubscribersChanged(() => this.syncCaptureLoop());
  }

  current(): CameraStatus {
    return this.status;
  }

  getStatus(): CameraStatus {
    return this.status;
  }

  getLastError(): CameraError | null {
    return this.lastError;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getVideo(): HTMLVideoElement | null {
    return this.video;
  }

  getOptions(): CameraRequestOptions | null {
    return this.options;
  }

  getDevices(): CameraDeviceInfo[] {
    return this.devices;
  }

  getFrameBus(): FrameBus {
    return this.bus;
  }

  getCaptureMaxEdge(): number {
    return this.captureMaxEdge;
  }

  setCaptureMaxEdge(maxEdge: number): void {
    this.setCaptureBudget("default", maxEdge);
  }

  setCaptureBudget(consumerId: string, maxEdge: number | null): void {
    if (maxEdge === null || !Number.isFinite(maxEdge) || maxEdge <= 0) {
      this.captureBudgets.delete(consumerId);
    } else {
      this.captureBudgets.set(consumerId, maxEdge);
    }
    let next = 0;
    for (const value of this.captureBudgets.values()) {
      next = Math.max(next, value);
    }
    this.captureMaxEdge = next > 0 ? next : 640;
  }

  setKeepCaptureInBackground(keep: boolean): void {
    this.keepCaptureInBackground = keep;
    this.syncBackground();
  }

  subscribeStatus(listener: CameraStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status, this.lastError);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribe(
    consumerId: string,
    fps: number,
    onFrame: (frame: CameraFrame) => void | Promise<void>,
  ): () => void {
    return this.bus.subscribe(consumerId, fps, onFrame);
  }

  setSubscriberFps(consumerId: string, fps: number): void {
    this.bus.setSubscriberFps(consumerId, fps);
  }

  async request(options: CameraRequestOptions): Promise<void> {
    if (!this.isSecureContextFn()) {
      const error = messageFor("insecure");
      this.setStatus("denied", error);
      throw Object.assign(new Error(error.message), { name: "InsecureContext" });
    }

    const generation = ++this.requestGeneration;
    this.stopCaptureLoop();
    this.releaseStream();
    this.setStatus("requesting", null);

    try {
      const stream = await this.acquireStream(options);
      if (generation !== this.requestGeneration) {
        stopTracks(stream);
        return;
      }

      this.stream = stream;
      this.options = { ...options };
      this.bindTrackEnded(stream);
      await this.attachVideo(stream);
      if (generation !== this.requestGeneration) {
        this.releaseStream();
        return;
      }

      this.devices = await this.refreshDevices();
      this.ensureVisibility();
      this.setStatus("live", null);
      this.syncBackground();
      this.syncCaptureLoop();
    } catch (error) {
      if (generation !== this.requestGeneration) {
        return;
      }
      const mapped = mapCameraError(error);
      this.releaseStream();
      this.setStatus(statusFor(mapped.code), mapped);
      throw error;
    }
  }

  async reconfigure(
    patch: Partial<CameraRequestOptions>,
  ): Promise<void> {
    const current = this.options ?? {
      facingMode: "environment",
      width: 1280,
      height: 720,
      fps: 24,
    };
    const next: CameraRequestOptions = {
      ...current,
      ...patch,
    };
    if (patch.facingMode && patch.deviceId === undefined) {
      delete next.deviceId;
    }
    await this.request(next);
  }

  async stop(): Promise<void> {
    this.requestGeneration += 1;
    this.stopCaptureLoop();
    this.releaseStream();
    this.canvas = null;
    this.ctx = null;
    this.options = null;
    this.tracksMuted = false;
    this.setStatus("idle", null);
  }

  async listDevices(): Promise<CameraDeviceInfo[]> {
    this.devices = await this.refreshDevices();
    return this.devices;
  }

  /** Test helper: push one captured bitmap through FrameBus. */
  async pumpFrame(frame: CameraFrame): Promise<void> {
    const result = await this.bus.publish(frame);
    if (!result.transferredSource) {
      try {
        frame.bitmap.close();
      } catch {
        /* already closed */
      }
    }
  }

  private async acquireStream(
    options: CameraRequestOptions,
  ): Promise<MediaStream> {
    const attempts: MediaStreamConstraints[] = [
      {
        audio: false,
        video: {
          facingMode: { ideal: options.facingMode },
          width: { ideal: options.width, min: 320 },
          height: { ideal: options.height, min: 240 },
          frameRate: { ideal: options.fps, max: 30 },
          ...(options.deviceId ? { deviceId: { ideal: options.deviceId } } : {}),
        },
      },
      {
        audio: false,
        video: {
          facingMode: { ideal: options.facingMode },
          ...(options.deviceId ? { deviceId: { ideal: options.deviceId } } : {}),
        },
      },
      {
        audio: false,
        video: {
          facingMode: { ideal: options.facingMode },
        },
      },
      {
        audio: false,
        video: options.deviceId ? { deviceId: { ideal: options.deviceId } } : true,
      },
      {
        audio: false,
        video: true,
      },
    ];

    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        return await this.getUserMediaFn(constraints);
      } catch (error) {
        lastError = error;
        const mapped = mapCameraError(error);
        if (mapped.code !== "overconstrained") {
          throw error;
        }
      }
    }
    throw lastError;
  }

  private async attachVideo(stream: MediaStream): Promise<void> {
    if (!this.video) {
      this.video = this.createVideoFn();
    }
    this.video.srcObject = stream;
    this.video.muted = true;
    try {
      await this.video.play();
    } catch {
      /* autoplay can fail if the element is not in the document; preview play() retries */
    }
  }

  private bindTrackEnded(stream: MediaStream): void {
    this.clearEndedHandlers();
    for (const track of stream.getTracks()) {
      const handler = () => {
        if (this.status === "live" && this.stream === stream) {
          this.stopCaptureLoop();
          this.setStatus("error", messageFor("track-ended"));
        }
      };
      track.addEventListener("ended", handler);
      this.endedHandlers.push({ track, handler });
    }
  }

  private clearEndedHandlers(): void {
    for (const { track, handler } of this.endedHandlers) {
      track.removeEventListener("ended", handler);
    }
    this.endedHandlers = [];
  }

  private releaseStream(): void {
    this.clearEndedHandlers();
    if (this.stream) {
      stopTracks(this.stream);
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  private ensureVisibility(): void {
    if (this.unsubVisibility) {
      return;
    }
    this.unsubVisibility = this.visibility.subscribe(() => this.syncBackground());
  }

  private syncBackground(): void {
    if (this.status !== "live") {
      return;
    }
    const hidden = this.visibility.hidden();
    if (hidden && !this.keepCaptureInBackground) {
      this.stopCaptureLoop();
      this.setTracksMuted(true);
      return;
    }
    this.setTracksMuted(false);
    this.syncCaptureLoop();
  }

  private setTracksMuted(muted: boolean): void {
    this.tracksMuted = muted;
    if (!this.stream) {
      return;
    }
    for (const track of this.stream.getTracks()) {
      track.enabled = !muted;
    }
  }

  private syncCaptureLoop(): void {
    if (!this.autoCapture || this.status !== "live") {
      this.stopCaptureLoop();
      return;
    }
    if (this.tracksMuted || (this.visibility.hidden() && !this.keepCaptureInBackground)) {
      this.stopCaptureLoop();
      return;
    }
    if (!this.bus.hasSubscribers()) {
      this.stopCaptureLoop();
      return;
    }
    if (this.captureMode) {
      return;
    }
    this.startCaptureLoop();
  }

  private startCaptureLoop(): void {
    this.stopCaptureLoop();
    const video = this.video;
    if (!video) {
      return;
    }

    const withRvfc =
      "requestVideoFrameCallback" in video &&
      typeof video.requestVideoFrameCallback === "function";
    if (withRvfc) {
      this.captureMode = "rvfc";
      const tick = (_now: number, metadata: { mediaTime?: number }) => {
        void this.captureFrame((metadata.mediaTime ?? 0) * 1000);
        if (this.captureMode === "rvfc" && this.video) {
          this.captureHandle = this.video.requestVideoFrameCallback(tick);
        }
      };
      this.captureHandle = video.requestVideoFrameCallback(tick);
      return;
    }

    this.captureMode = "raf";
    const tick = () => {
      void this.captureFrame(this.now());
      if (this.captureMode === "raf") {
        this.captureHandle = requestAnimationFrame(tick);
      }
    };
    this.captureHandle = requestAnimationFrame(tick);
  }

  private stopCaptureLoop(): void {
    if (this.captureHandle !== null && this.captureMode === "rvfc" && this.video) {
      this.video.cancelVideoFrameCallback(this.captureHandle);
    }
    if (this.captureHandle !== null && this.captureMode === "raf") {
      cancelAnimationFrame(this.captureHandle);
    }
    this.captureHandle = null;
    this.captureMode = null;
    this.capturing = false;
  }

  private async captureFrame(timestampMs: number): Promise<void> {
    if (this.capturing || this.status !== "live" || !this.video) {
      return;
    }
    if (!this.bus.hasSubscribers()) {
      return;
    }
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (!width || !height) {
      return;
    }

    this.capturing = true;
    try {
      const size = captureSize(width, height, this.captureMaxEdge);
      const bitmap = await this.bitmapFromVideo(this.video, size.width, size.height);
      this.frameId += 1;
      const frame: CameraFrame = {
        frameId: this.frameId,
        timestampMs,
        width: size.width,
        height: size.height,
        bitmap,
      };
      const published = await this.bus.publish(frame);
      if (!published.transferredSource) {
        try {
          bitmap.close();
        } catch {
          /* already closed */
        }
      }
    } finally {
      this.capturing = false;
    }
  }

  private async bitmapFromVideo(
    video: HTMLVideoElement,
    outWidth: number,
    outHeight: number,
  ): Promise<ImageBitmap> {
    const needsResize = video.videoWidth !== outWidth || video.videoHeight !== outHeight;
    try {
      if (needsResize) {
        return await this.createImageBitmapFn(video, {
          resizeWidth: outWidth,
          resizeHeight: outHeight,
          resizeQuality: "low",
        });
      }
      return await this.createImageBitmapFn(video);
    } catch {
      /* canvas fallback */
    }

    if (
      !this.canvas ||
      this.canvas.width !== outWidth ||
      this.canvas.height !== outHeight
    ) {
      this.canvas = makeCanvas(outWidth, outHeight);
      this.ctx = this.canvas.getContext("2d") as typeof this.ctx;
    }
    if (!this.ctx || !this.canvas) {
      throw new Error("Camera capture canvas is not available.");
    }
    this.ctx.drawImage(video, 0, 0, outWidth, outHeight);
    return this.createImageBitmapFn(this.canvas);
  }

  private async refreshDevices(): Promise<CameraDeviceInfo[]> {
    try {
      const devices = await this.enumerateDevicesFn();
      return devices
        .filter((device) => device.kind === "videoinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || "Camera",
          facing: inferFacing(device.label, this.options?.facingMode),
        }));
    } catch {
      return [];
    }
  }

  private setStatus(status: CameraStatus, error: CameraError | null): void {
    this.status = status;
    this.lastError = error;
    for (const listener of this.listeners) {
      listener(status, error);
    }
  }
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function inferFacing(
  label: string,
  fallback: FacingMode | undefined,
): FacingMode | "unknown" {
  const lower = label.toLowerCase();
  if (/front|user|face/.test(lower)) {
    return "user";
  }
  if (/back|rear|environment|world/.test(lower)) {
    return "environment";
  }
  return fallback ?? "unknown";
}
