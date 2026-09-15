import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, type Plugin } from "vite";
import { APP_DESCRIPTION, APP_NAME, APP_NAME_SHORT } from "./src/app/brand";

function isCacheableModelAsset(url: string): boolean {
  const pathName = url.split("?")[0] ?? "";
  return (
    /\/(models|ort|tesseract|mediapipe)\//.test(pathName) ||
    /\.(onnx|wasm|task|traineddata)(?:\.gz)?$/.test(pathName)
  );
}

function modelCacheHeaders(): Plugin {
  const apply = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url && isCacheableModelAsset(req.url)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
    next();
  };
  return {
    name: "inclusive-tourism-model-cache-headers",
    configureServer(server) {
      server.middlewares.use(apply);
    },
    configurePreviewServer(server) {
      server.middlewares.use(apply);
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    modelCacheHeaders(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["favicon.svg", "pwa/icon-192.png", "pwa/icon-512.png"],
      manifest: {
        id: "/",
        name: APP_NAME,
        short_name: APP_NAME_SHORT,
        description: APP_DESCRIPTION,
        theme_color: "#0c5c6e",
        background_color: "#f4f6f9",
        display: "standalone",
        display_override: ["standalone", "browser"],
        orientation: "any",
        scope: "/",
        start_url: "/",
        categories: ["travel", "accessibility", "utilities"],
        lang: "en",
        dir: "ltr",
        icons: [
          {
            src: "pwa/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
        globIgnores: [
          "**/tesseract/**",
          "**/models/**",
          "**/ort/**",
          "**/mediapipe/**",
          "**/*.wasm",
          "**/*.onnx",
          "**/*.traineddata*",
          "**/tesseract-core*.js",
        ],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [
          /^\/models\//,
          /^\/ort\//,
          /^\/tesseract\//,
          /^\/mediapipe\//,
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@mara/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web", "tesseract.js", "@mediapipe/tasks-vision"],
  },
  worker: {
    format: "es",
  },
});
