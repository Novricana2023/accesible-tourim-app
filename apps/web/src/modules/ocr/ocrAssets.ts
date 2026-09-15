import { resourceExists } from "@/lib/resourceExists";

export const TESSERACT_WORKER_PATH = "/tesseract/worker.min.js";
export const TESSERACT_CORE_DIR = "/tesseract/";
export const TESSERACT_LANG_FILE = "/tesseract/lang/eng.traineddata.gz";

export const OCR_ASSETS_MISSING_REASON =
  "Reading is unavailable. Tesseract assets are not installed. Run npm run models in apps/web.";

export async function probeOcrAssets(): Promise<{ ok: boolean; reason: string | null }> {
  const urls = [TESSERACT_WORKER_PATH, `${TESSERACT_CORE_DIR}tesseract-core-simd-lstm.wasm.js`, TESSERACT_LANG_FILE];
  for (const url of urls) {
    if (!(await resourceExists(url))) {
      return { ok: false, reason: OCR_ASSETS_MISSING_REASON };
    }
  }
  return { ok: true, reason: null };
}
