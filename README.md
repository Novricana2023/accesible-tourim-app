# Inclusive Tourism

Camera-first accessibility web app for vision assistance and isolated sign-language communication.

Assist runs on-device YOLOv8n object detection, Tesseract reading, and camera path assistance. Communicate runs MediaPipe hand landmarks plus an optional isolated-sign classifier when trained weights are present. If a model or browser API is missing, the matching control stays visible and is announced as unavailable — Inclusive Tourism does not invent detections, text, or glosses.

## Run the web app

```bash
cd apps/web
npm install
npm run dev
```

Tests and production build:

```bash
cd apps/web
npm install
npm run models
npm run test
npm run build
```

`npm run models` downloads YOLOv8n ONNX (AGPL-3.0), ONNX Runtime WASM files, and Tesseract.js reading assets (worker, WASM core, English tessdata_fast).

Performance constraints, the device matrix, and what cannot work on iOS Safari are documented in `docs/PERFORMANCE.md`.

From the repository root (npm workspaces):

```bash
npm install
npm run dev
```

Open the local URL Vite prints, usually `http://localhost:5173`.

## Progressive Web App

Production builds are installable PWAs (HTTPS or localhost). The service worker precaches the app shell only; ONNX, WASM, Tesseract, and MediaPipe assets stay on-demand and are never substituted with placeholders.

```bash
cd apps/web
npm run build
npm run preview
```

Install from the browser menu or the in-app **Install app** banner when eligible. See `apps/web/docs/PWA.md` for offline behavior, icons, and Capacitor packaging notes.

## Deploy to production

Production builds download AI assets and compile the PWA:

```bash
npm install
npm run build:production
```

Deploy the `apps/web/dist` folder to any static host, or connect the repo to Vercel (see root `vercel.json` and `docs/DEPLOYMENT.md`). Camera and microphone require **HTTPS** in production. No backend server is required; optional `VITE_API_BASE_URL` is documented in `apps/web/.env.example`.
