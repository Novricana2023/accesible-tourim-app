# Progressive Web App (Inclusive Tourism)

## Distribution

- **Primary format:** installable PWA from any **HTTPS** origin (or `localhost` for development).
- **Build:** `npm run build` → static assets in `dist/` plus `sw.js` and `manifest.webmanifest`.
- **Preview / test install:** `npm run preview` then open the printed URL in Chrome or Edge.

## What the service worker caches

- **Precached:** application shell (HTML, JS, CSS, fonts, SVG, PNG icons). Large AI assets are **excluded**.
- **Not precached:** `/models/**`, `/ort/**`, `/tesseract/**`, `/mediapipe/**`, WASM, ONNX, traineddata.
- **Runtime model cache:** the app stores downloaded model bytes in the Cache API (`mara-models-v1`) after first successful fetch.

Camera and microphone streams are never cached.

## Offline behavior

- The UI opens offline after install.
- **Speech recognition** generally requires network (Web Speech in Chrome).
- **Vision / OCR / sign** only work offline if the required files were already downloaded on that device; the offline banner probes local assets and does not claim otherwise.

## Icons

Run `npm run icons` (also runs automatically before `npm run build`) to regenerate PNGs in `public/pwa/` from `public/favicon.svg`.

## Capacitor (later)

See `capacitor.config.ts`. Point Capacitor at `dist` after `npm run build`. Use `@capacitor/camera` only if you later need native camera bridges; the current web `getUserMedia` flow is unchanged.
