import { publicAssetUrl } from "@/lib/publicAssetUrl";
import { resourceExists } from "@/lib/resourceExists";

export const TESSERACT_WORKER_PATH = "/tesseract/worker.min.js";
export const TESSERACT_CORE_DIR = "/tesseract/";
/** Shipped by `npm run models` (uncompressed tessdata_fast). */
export const TESSERACT_LANG_FILE = "/tesseract/lang/eng.traineddata";
export const TESSERACT_LANG_FILE_GZ = "/tesseract/lang/eng.traineddata.gz";

export const TESSERACT_CORE_CANDIDATES = [
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.wasm",
  "tesseract-core-simd.wasm.js",
  "tesseract-core.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
] as const;

export const OCR_ASSETS_MISSING_REASON =
  "Reading is unavailable. Tesseract files are missing on the server. Redeploy with build command npm run build:production (includes npm run models).";

export async function resolveTesseractCorePath(): Promise<string | null> {
  for (const name of TESSERACT_CORE_CANDIDATES) {
    const path = `${TESSERACT_CORE_DIR}${name}`;
    if (await resourceExists(path)) {
      return publicAssetUrl(path);
    }
  }
  return null;
}

export async function resolveTesseractLangGzip(): Promise<boolean> {
  if (await resourceExists(TESSERACT_LANG_FILE_GZ)) {
    return true;
  }
  return false;
}

export async function probeOcrAssets(): Promise<{ ok: boolean; reason: string | null }> {
  if (!(await resourceExists(TESSERACT_WORKER_PATH))) {
    return { ok: false, reason: OCR_ASSETS_MISSING_REASON };
  }
  const core = await resolveTesseractCorePath();
  if (!core) {
    return { ok: false, reason: OCR_ASSETS_MISSING_REASON };
  }
  const langOk =
    (await resourceExists(TESSERACT_LANG_FILE)) ||
    (await resourceExists(TESSERACT_LANG_FILE_GZ));
  if (!langOk) {
    return { ok: false, reason: OCR_ASSETS_MISSING_REASON };
  }
  return { ok: true, reason: null };
}
