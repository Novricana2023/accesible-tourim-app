# Mara performance and device limits

This document records what the camera pipelines actually do, what was optimized, and which limits are platform constraints rather than missing product work. Mara does not invent detections, OCR text, or sign glosses to raise a frame-rate number.

Live video is not uploaded. Chrome Web Speech recognition is a Google network service; that is disclosed in the UI. No extra polling was added for speech or models.

## What the loops do

| Pipeline | When it runs | Engine | Typical rate |
| --- | --- | --- | --- |
| Object detection | Assist continuous vision | YOLO ONNX in a worker (WebGPU, then WASM) | Adaptive. Desktop WebGPU up to about 15 Hz; WASM and phones lower. |
| OCR | Assist reading | Tesseract LSTM in a worker | About 1 Hz on phones, 1–1.5 Hz on laptops. |
| Path assistance | Assist navigation | Geometry on detection tracks | Same as detection. Speech is filtered. |
| Isolated signs | Communicate signer camera | MediaPipe Hands + optional ONNX classifier | About 8–16 landmark Hz; classify every few frames. |
| Partner captions | Communicate Mode B | Web Speech API | Event-driven. Unavailable where the API is missing. |

Assist and Communicate are exclusive. YOLO, Tesseract, and MediaPipe are not loaded together. Each engine is created when that mode starts and disposed when it stops.

## Optimizations in this pass

- Capture runs only while a FrameBus consumer is subscribed. Preview uses the `<video>` element and does not copy pixels.
- Capture is downscaled to the detector/OCR/sign budget. Frames are not upscaled.
- Single-consumer frames are transferred instead of cloned.
- Hidden tabs pause capture, mute `MediaStreamTrack.enabled`, and pause inference unless background warnings are on. Unmount, Stop, and facing switch still call `track.stop()`.
- Detection and OCR workers reuse canvases. ORT input and output tensors are disposed. Tesseract no longer PNG-encodes every frame.
- Model bytes go through the Cache API when present. Vite sets long `Cache-Control` on `/models`, `/ort`, `/tesseract`, and `/mediapipe`. There is no service worker: intercepting navigations can break assistive technology.
- React chrome (header, nav, settings, home actions) no longer re-renders on every detection. Perception UI updates are coalesced at about 5–8 Hz. Speech, navigation ingest, and cooldowns still see every inference.
- Phones and tablets start at a smaller input size and a lower FPS cap. The Settings “Balanced / Power-save” toggle still works; mobile Balanced is already conservative.

## Device and browser matrix

| Surface | Camera Assist | Reading (OCR) | Path assistance | Communicate signer | Communicate captions / voice |
| --- | --- | --- | --- | --- | --- |
| Chrome desktop, HTTPS or localhost | Works if a camera exists. WebGPU if `requestAdapter` succeeds; otherwise WASM. | Works if Tesseract assets are installed. | Works when continuous vision is live. Not collision avoidance. | Works if MediaPipe assets load. Classifier stays off without real pack weights. | Web Speech is a network service. Whisper-tiny is not shipped. |
| Chrome Android | Works. Rear camera preferred. Capture and detector input start smaller. WASM is common. Touch targets stay 44px or larger. | Works, slower. | Same as desktop, at the mobile detection rate. | Works if the device can run Hands. Often slower; FPS is capped. | Same Chrome network speech disclosure. |
| Safari iOS | Camera needs a user gesture and HTTPS. WebGPU is often missing or unstable; inference falls back to WASM and is not kept on a failed GPU session. | Tesseract WASM is heavy; expect 1 Hz or pauses. | Depends on vision. | MediaPipe may fail; the control stays visible and is announced as unavailable. No fake glosses. | `SpeechRecognition` may be missing, require a gesture, or fail after listing as present. Mode B stays visible and disabled with a spoken/visible reason. |

Firefox and other browsers follow the same capability probe. If `getUserMedia`, WebGPU, WASM, or SpeechRecognition is missing, the matching control stays in the UI and is disabled with a reason. Results are not stubbed.

## Unavoidable limits

- A phone cannot run YOLO, OCR, and Holistic usefully at once. Exclusive modes are the product, not a temporary flag.
- Monocular video has no reliable metric depth. Position is left/center/right and near/mid/far.
- COCO-80 does not include stairs, curbs, poles, or many access-critical classes. Missing classes are not invented.
- Tesseract on-device is slow. Continuous reading is 1–2 Hz by design.
- Isolated-sign recognition is a closed vocabulary after a confidence gate. It is not sentence translation.
- iOS Safari WebGPU, SpeechRecognition, and camera permission UX are OS limits.
- Adaptive FPS and 320/416 input reduce load. They also reduce detector recall. Mara announces a drop; it does not pad empty frames with fake objects.
- HTTP cache and the Cache API still need a first download of ONNX, ORT WASM, tessdata, and MediaPipe tasks. Later visits should hit cache when the origin allows it.
- `speechSynthesis` quality depends on the OS voice pack.

## How to verify locally

```bash
cd apps/web
npm run test
npm run build
```

Manual checks that must still pass after performance work: camera Stop releases tracks; speech echo guard; OCR empty announcement; navigation path filter; Communicate A/B isolation; live regions, focus, contrast, and keyboard.
