import { selectReadableText } from "@/modules/ocr/ocrGeometry";
import type { OcrResult } from "@mara/shared";
import type { OcrStatus } from "@/modules/ocr/OcrRuntime";
import { BookOpen } from "lucide-react";

export function ReadingDisplay({
  status,
  result,
  unavailableReason,
}: {
  status: OcrStatus;
  result: OcrResult | null;
  unavailableReason?: string | null;
}) {
  if (status === "idle") {
    return null;
  }

  const waiting = status === "loading";
  const paused = status === "paused";
  const text = result
    ? selectReadableText(
        result.regions.map((region) => ({
          text: region.text,
          confidence: region.confidence,
          box: region.box,
        })),
      )
    : "";

  return (
    <section
      aria-labelledby="reading-heading"
      className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <BookOpen className="size-6 text-primary" aria-hidden />
        <h2 id="reading-heading" className="text-xl font-bold">
          Detected text
        </h2>
      </div>
      <p className="text-lg" role="status">
        {waiting
          ? "Starting the reading engine."
          : paused
            ? "Reading is paused."
            : status === "unavailable"
              ? (unavailableReason ?? "Reading is unavailable.")
              : "Reading is active. Hold the camera steady on printed text."}
      </p>
      <p
        className="min-h-[4rem] break-words rounded-md border border-border bg-surface-inset px-4 py-5 text-2xl font-bold leading-snug text-fg sm:text-3xl"
        aria-live="polite"
      >
        {text || "No printed text in view."}
      </p>
    </section>
  );
}
