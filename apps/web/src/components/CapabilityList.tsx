import type { Capability, CapabilityReport } from "@mara/shared";

const LABELS: Record<Capability, string> = {
  camera: "Camera",
  mic: "Microphone",
  webgpu: "WebGPU",
  "wasm-simd": "WASM SIMD",
  "speech-synthesis": "Speech synthesis",
  "speech-recognition": "Speech recognition",
  geolocation: "Geolocation (not used for routing)",
  orientation: "Device orientation",
};

function backendLabel(report: CapabilityReport): string {
  if (report.inferenceBackend === "webgpu") {
    return "WebGPU";
  }
  if (report.inferenceBackend === "wasm") {
    return "WASM";
  }
  return "Unavailable";
}

function speechInLabel(report: CapabilityReport): string {
  if (report.speechInEngine === "webspeech") {
    return "Web Speech API (network in Chrome)";
  }
  if (report.speechInEngine === "whisper-tiny") {
    return "Whisper-tiny";
  }
  return "Unavailable";
}

export function CapabilityList({
  report,
  heading = "This device",
}: {
  report: CapabilityReport | null;
  heading?: string;
}) {
  if (!report) {
    return (
      <section aria-labelledby="capability-heading" className="space-y-4">
        <h2 id="capability-heading" className="text-xl font-bold">
          {heading}
        </h2>
        <p>Checking device capabilities.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="capability-heading" className="space-y-4">
      <h2 id="capability-heading" className="text-xl font-bold">
        {heading}
      </h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(LABELS) as Capability[]).map((key) => (
          <div
            key={key}
            className="rounded-md border border-border bg-surface-inset px-4 py-3"
          >
            <dt className="text-base text-fg-muted">{LABELS[key]}</dt>
            <dd className="text-lg font-semibold">
              {report.available[key] ? "Available" : "Not available"}
            </dd>
          </div>
        ))}
        <div className="rounded-md border border-border bg-surface-inset px-4 py-3">
          <dt className="text-base text-fg-muted">Inference backend</dt>
          <dd className="text-lg font-semibold">{backendLabel(report)}</dd>
        </div>
        <div className="rounded-md border border-border bg-surface-inset px-4 py-3">
          <dt className="text-base text-fg-muted">Speech-in engine</dt>
          <dd className="text-lg font-semibold">{speechInLabel(report)}</dd>
        </div>
      </dl>
      {report.notes.length > 0 ? (
        <ul className="space-y-2 text-base text-fg-muted">
          {report.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
