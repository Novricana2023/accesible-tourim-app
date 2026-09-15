# Detection models

YOLOv8n ONNX (COCO-80) is the default Phase 2 detector.

## Install weights

From `apps/web`:

```bash
npm run models
```

This downloads `yolov8n.onnx` into this folder, copies ONNX Runtime Web WASM files to `public/ort/`, and copies Tesseract.js worker/core files plus English traineddata to `public/tesseract/`. The large binaries are not committed.

## License

Ultralytics YOLO is **AGPL-3.0**. Using these weights in a closed distribution is a ship-blocker unless Mara is open-sourced under a compatible license or a commercial Ultralytics grant is obtained. See `docs/ARCHITECTURE.md` section 2.

## Runtime

Assist loads `/models/manifest.json`, then the ONNX file named there, in a Web Worker via ONNX Runtime Web (WebGPU, then WASM). If the file or runtime is missing, Mara announces that detection is unavailable. It does not invent boxes.
