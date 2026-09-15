import { APP_NAME } from "@/app/brand";
import { Label } from "@/components/ui/label";
import { clampSpeechRate } from "@mara/shared";

export function SpeechRateControl({
  rate,
  onChange,
}: {
  rate: number;
  onChange: (rate: number) => void;
}) {
  return (
    <div className="space-y-3 border-t border-border pt-6">
      <Label htmlFor="mode-speech-rate">Speech speed</Label>
      <input
        id="mode-speech-rate"
        type="range"
        min={0.5}
        max={2}
        step={0.1}
        value={rate}
        aria-valuemin={0.5}
        aria-valuemax={2}
        aria-valuenow={rate}
        aria-valuetext={`${rate.toFixed(1)} times normal`}
        className="mt-3 min-h-12 w-full accent-primary"
        onChange={(event) => {
          onChange(clampSpeechRate(Number(event.target.value)));
        }}
      />
      <p className="mt-2 text-base text-fg-muted">
        {rate.toFixed(1)}× normal. Applies to {APP_NAME}&apos;s spoken voice on this device.
      </p>
    </div>
  );
}
