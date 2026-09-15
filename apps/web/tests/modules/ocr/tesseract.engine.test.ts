import { access, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createWorker, PSM } from "tesseract.js";
import { makeStopPng } from "./makeStopPng";

const langFile = path.resolve(process.cwd(), "public/tesseract/lang/eng.traineddata");

async function assetsPresent(): Promise<boolean> {
  try {
    await access(langFile);
    return true;
  } catch {
    return false;
  }
}

describe("Tesseract engine", () => {
  it(
    "reads STOP from a generated printed-text PNG",
    async () => {
      if (!(await assetsPresent())) {
        console.warn(
          "Skipping real OCR fixture. Run `npm run models` in apps/web to copy Tesseract assets, then re-run tests.",
        );
        return;
      }
      const pngPath = path.join(os.tmpdir(), "mara-ocr-stop.png");
      await writeFile(pngPath, makeStopPng());
      const worker = await createWorker("eng", 1, {
        langPath: path.resolve(process.cwd(), "public/tesseract/lang"),
        cachePath: path.resolve(process.cwd(), "public/tesseract/lang"),
        gzip: false,
      });
      try {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
        const recognized = await worker.recognize(pngPath);
        expect(recognized.data.text.toUpperCase()).toContain("STOP");
      } finally {
        await worker.terminate();
      }
    },
    30000,
  );
});
