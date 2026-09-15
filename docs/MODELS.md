# Mara model distribution

## Phase 2 detector

- **Provider id:** `yolo8n-onnx`
- **Weights:** Ultralytics YOLOv8n, COCO-80, ONNX, 640 input
- **Install:** `cd apps/web && npm run models`
- **License:** AGPL-3.0 (Ultralytics). This is a **ship-blocker** for a closed Mara binary unless we buy a commercial grant or replace the detector with a permissively licensed ONNX model.

The web app never ships fake detections. If `public/models/yolov8n.onnx` is missing, Assist stays honest and announces that object detection is unavailable.

## Phase 4 OCR (Tesseract)

PP-OCRv4 ONNX recognition is too heavy for this slice. Continuous reading uses **Tesseract.js** in a worker on real camera frames.

- **Install:** `cd apps/web && npm run models`
- **Assets:** `public/tesseract/worker.min.js`, `public/tesseract/tesseract-core-*.wasm.js`, `public/tesseract/lang/eng.traineddata` (tessdata_fast)
- If those files are missing, Start reading stays off and Mara announces that reading is unavailable. It does not invent signs or canned text.

Accuracy is modest on scene text. Latency is often 0.5–2 s per tick at about 1–2 Hz, so Mara announces that reading is slower than object detection. English only in this build.

## What these weights cannot do

- COCO-80 has no stairs, curbs, poles, or canes.
- Depth is a bounding-box area band (`near` / `mid` / `far`), not meters.
- Indoor navigation and sign-language packs are separate phases.
- Scene OCR is slower and less accurate than document OCR. Distant, motion-blurred, or low-contrast signs will be dropped or misread.
