import { describe, expect, it, vi } from "vitest";
import * as resourceExistsModule from "@/lib/resourceExists";
import { probeOcrAssets, TESSERACT_LANG_FILE } from "@/modules/ocr/ocrAssets";

describe("probeOcrAssets", () => {
  it("accepts uncompressed eng.traineddata from npm run models", async () => {
    vi.spyOn(resourceExistsModule, "resourceExists").mockImplementation(async (url) => {
      if (url.includes("worker.min.js")) {
        return true;
      }
      if (url.includes("tesseract-core-simd-lstm.wasm.js")) {
        return true;
      }
      if (url === TESSERACT_LANG_FILE) {
        return true;
      }
      return false;
    });
    const result = await probeOcrAssets();
    expect(result.ok).toBe(true);
    vi.restoreAllMocks();
  });
});
