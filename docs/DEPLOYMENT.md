# Production deployment (Inclusive Tourism)

This repository is a **static SPA + PWA**. There is **no FastAPI or Node server** in the repo. All vision, OCR, and sign-language inference runs **in the browser** via ONNX Runtime Web, Tesseract.js, and MediaPipe.

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+ (workspaces at repo root)

## Production build (local verification)

From the repository root:

```bash
npm install
npm run build:production
npm run preview -w @mara/web
```

`build:production` runs `npm run models` (downloads YOLOv8n ONNX, copies ORT/Tesseract/MediaPipe assets into `public/`) then `tsc` + `vite build`. Output: `apps/web/dist/`.

## Vercel

1. Import the GitHub repository.
2. Leave **Root Directory** empty (repo root). `vercel.json` sets:
   - `buildCommand`: `npm run build:production`
   - `outputDirectory`: `apps/web/dist`
3. **Environment variables** (Project → Settings → Environment Variables):
   - None required for current features.
   - Optional: `VITE_API_BASE_URL` = `https://your-api.example.com` (HTTPS only; localhost is ignored in production builds). See `apps/web/.env.example`.
4. Deploy. After deploy, open `https://<your-domain>/` and deep links such as `/vision`, `/read`, `/settings` (SPA rewrites in `vercel.json`).

### Asset size

The deploy includes large static files (~100MB+): ONNX, WASM, tessdata. Vercel must run `npm run models` during build (included in `build:production`). Do not skip this step.

### HTTPS and camera/microphone

`getUserMedia` requires a **secure context**: HTTPS in production (or localhost in dev). Vercel provides HTTPS automatically.

## PWA after deploy

- Service worker (`sw.js`) precaches the app shell only.
- Models under `/models`, `/ort`, `/tesseract`, `/mediapipe` are fetched on demand and cached by the app’s model cache where supported.
- Install via browser “Install app” or the in-app banner when eligible.

## Sign language classifier weights

Hand tracking uses MediaPipe (`hand_landmarker.task`, downloaded by `npm run models`). **ASL/SASL/BSL ONNX classifiers are optional** and are not downloaded automatically. Place trained packs under `public/models/sign-language/` before build if you ship them.

## AGPL note

YOLOv8n weights are AGPL-3.0. See `public/models/manifest.json` and `public/models/README.md` before distributing a closed build.

## Checklist before go-live

- [ ] `npm run build:production` succeeds on CI or locally
- [ ] `npm run test -w @mara/web` passes
- [ ] Open production URL on HTTPS; test `/vision` camera permission
- [ ] Confirm `/models/yolov8n.onnx` returns 200 (Network tab)
- [ ] Confirm installable PWA (Chrome Application → Manifest)
