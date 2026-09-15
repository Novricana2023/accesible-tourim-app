import * as Checkbox from "@radix-ui/react-checkbox";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as Switch from "@radix-ui/react-switch";
import type { SignLanguagePackId, SpeechRequest, UserPrefs } from "@mara/shared";
import { MAX_DETECTION_SENSITIVITY, SUPPORTED_SPEECH_IN_LOCALES } from "@mara/shared";
import { CapabilityList } from "@/components/CapabilityList";
import { PageBackLink } from "@/components/layout/PageBackLink";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { APP_NAME, appDocumentTitle } from "@/app/brand";
import { useMaraSession } from "@/app/runtime";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { listSpeechVoices, type SpeechVoiceOption } from "@/lib/speech/voices";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

const CATEGORIES: Array<{ id: SpeechRequest["category"]; label: string }> = [
  { id: "hazard", label: "Hazard" },
  { id: "safety", label: "Safety" },
  { id: "user", label: "User-initiated / OCR" },
  { id: "nav", label: "Navigation" },
  { id: "scene", label: "Scene" },
  { id: "sign", label: "Sign" },
  { id: "system", label: "System" },
];

const fieldClass =
  "min-h-12 w-full rounded-lg border border-border bg-surface px-4 text-lg text-fg";

export function SettingsPage() {
  const { prefs, updatePrefs, capabilities } = useMaraSession();
  useDocumentTitle(appDocumentTitle("Settings"));

  const [voices, setVoices] = useState<SpeechVoiceOption[]>(() => listSpeechVoices());
  const [cameraDevices, setCameraDevices] = useState<Array<{ id: string; label: string }>>(
    [],
  );
  const speechSynthSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const refreshVoices = useCallback(() => {
    setVoices(listSpeechVoices());
  }, []);

  useEffect(() => {
    if (!speechSynthSupported) {
      return;
    }
    refreshVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
  }, [refreshVoices, speechSynthSupported]);

  function patch(next: Partial<UserPrefs>) {
    void updatePrefs(next);
  }

  async function refreshCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    setCameraDevices(
      devices
        .filter((device) => device.kind === "videoinput" && device.deviceId)
        .map((device) => ({
          id: device.deviceId,
          label: device.label || "Camera",
        })),
    );
  }

  return (
    <div className="space-y-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <PageBackLink />
      <header className="space-y-3">
        <h1 id="main-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
          Accessibility &amp; settings
        </h1>
        <p className="max-w-prose text-lg leading-relaxed text-fg-muted">
          Changes apply immediately and are saved on this device for every mode.
        </p>
      </header>

      <form className="space-y-10" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 text-xl font-bold">Display</legend>
          <Label htmlFor="text-scale">Text size</Label>
          <select
            id="text-scale"
            className={fieldClass}
            value={prefs.textScale}
            onChange={(event) => {
              patch({ textScale: event.target.value as UserPrefs["textScale"] });
            }}
          >
            <option value="default">Default</option>
            <option value="large">Large</option>
            <option value="xlarge">Extra large</option>
          </select>
          <p className="text-base text-fg-muted">
            Scales body text across the app. Does not change spoken wording.
          </p>
          <ToggleRow
            id="high-contrast"
            label="High contrast"
            description="Stronger text and borders for low-vision reading."
            checked={prefs.highContrast}
            onCheckedChange={(checked) => patch({ highContrast: checked })}
          />
          <ToggleRow
            id="reduce-motion"
            label="Reduce motion"
            description="Minimizes animations in the app interface. Your system setting is respected as well."
            checked={prefs.reduceMotion}
            onCheckedChange={(checked) => patch({ reduceMotion: checked })}
          />
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 text-xl font-bold">Speech output</legend>
          <RadioGroup.Root
            className="space-y-3"
            value={prefs.ttsMode}
            onValueChange={(value) => {
              patch({ ttsMode: value as UserPrefs["ttsMode"] });
            }}
            aria-label="Speech output"
          >
            <RadioRow
              value="aria-live"
              label="Live region only"
              description={`Announcements go to assistive technology. ${APP_NAME} does not use speechSynthesis.`}
            />
            <RadioRow
              value="speechSynthesis"
              label="Spoken voice only"
              description="Uses the browser speechSynthesis voices."
            />
            <RadioRow
              value="both"
              label="Live region and spoken voice"
              description="Can double-speak if a screen reader is also talking."
            />
          </RadioGroup.Root>
          <div className="space-y-3">
            <Label htmlFor="speech-rate">Speech rate</Label>
            <input
              id="speech-rate"
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={prefs.speechRate}
              aria-valuemin={0.5}
              aria-valuemax={2}
              aria-valuenow={prefs.speechRate}
              aria-valuetext={`${prefs.speechRate.toFixed(1)} times normal`}
              className="min-h-12 w-full accent-primary"
              disabled={!speechSynthSupported && prefs.ttsMode !== "aria-live"}
              onChange={(event) => {
                patch({ speechRate: Number(event.target.value) });
              }}
            />
            <p className="text-base text-fg-muted">
              {prefs.speechRate.toFixed(1)}× normal for speechSynthesis.
            </p>
          </div>
          {speechSynthSupported ? (
            <div className="space-y-3">
              <Label htmlFor="speech-volume">Speech volume</Label>
              <input
                id="speech-volume"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={prefs.speechVolume}
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={prefs.speechVolume}
                aria-valuetext={`${Math.round(prefs.speechVolume * 100)} percent`}
                className="min-h-12 w-full accent-primary"
                onChange={(event) => {
                  patch({ speechVolume: Number(event.target.value) });
                }}
              />
              <p className="text-base text-fg-muted">
                {Math.round(prefs.speechVolume * 100)}%. Some browsers ignore or clamp volume.
              </p>
            </div>
          ) : null}
          {speechSynthSupported && voices.length > 0 ? (
            <div className="space-y-3">
              <Label htmlFor="speech-voice">Spoken voice</Label>
              <select
                id="speech-voice"
                className={fieldClass}
                value={prefs.speechVoiceUri ?? ""}
                onChange={(event) => {
                  patch({
                    speechVoiceUri: event.target.value ? event.target.value : null,
                  });
                }}
              >
                <option value="">Browser default for language</option>
                {voices.map((voice) => (
                  <option key={voice.uri} value={voice.uri}>
                    {voice.name} ({voice.lang}
                    {voice.localService ? ", on-device" : ""})
                  </option>
                ))}
              </select>
              <p className="text-base text-fg-muted">
                Applies to speechSynthesis output. Partner speech captions use speech recognition,
                not this voice.
              </p>
            </div>
          ) : speechSynthSupported ? (
            <p className="text-base text-fg-muted" role="status">
              No speechSynthesis voices reported yet. Reload the page after the browser loads
              voices.
            </p>
          ) : (
            <p className="text-base text-fg-muted">
              Speech synthesis is not available in this browser.
            </p>
          )}
          <div className="space-y-3">
            <Label htmlFor="announcement-frequency">Announcement frequency</Label>
            <select
              id="announcement-frequency"
              className={fieldClass}
              value={prefs.announcementFrequency}
              onChange={(event) => {
                patch({
                  announcementFrequency: event.target
                    .value as UserPrefs["announcementFrequency"],
                });
              }}
            >
              <option value="minimal">Minimal: longer pauses between scene announcements</option>
              <option value="balanced">Balanced</option>
              <option value="frequent">Frequent: shorter pauses between scene announcements</option>
            </select>
            <p className="text-base text-fg-muted">
              Controls how often repeated object announcements are spoken during vision. Hazard
              announcements are not delayed.
            </p>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 text-xl font-bold">Vision &amp; reading</legend>
          <div className="space-y-3">
            <Label htmlFor="detection-sensitivity">Detection sensitivity</Label>
            <input
              id="detection-sensitivity"
              type="range"
              min={0}
              max={MAX_DETECTION_SENSITIVITY}
              step={1}
              value={prefs.detectionSensitivity}
              aria-valuemin={0}
              aria-valuemax={MAX_DETECTION_SENSITIVITY}
              aria-valuenow={prefs.detectionSensitivity}
              className="min-h-12 w-full accent-primary"
              disabled={!capabilities?.available.camera}
              onChange={(event) => {
                patch({ detectionSensitivity: Number(event.target.value) });
              }}
            />
            <p className="text-base text-fg-muted">
              Higher values report more objects (lower confidence cutoff). Applies on the next
              detection frame while vision is running.
            </p>
          </div>
          <ToggleRow
            id="ocr-enabled"
            label="OCR enabled"
            description="When off, Start reading stays unavailable."
            checked={prefs.ocrEnabled}
            onCheckedChange={(checked) => patch({ ocrEnabled: checked })}
          />
          <ToggleRow
            id="visual-overlay"
            label="Visual overlay"
            description="Draw detection boxes on the camera preview when vision is running."
            checked={prefs.visualOverlay}
            onCheckedChange={(checked) => patch({ visualOverlay: checked })}
          />
          <div className="space-y-3">
            <Label htmlFor="ocr-empty-ms">No-text announcement delay</Label>
            <input
              id="ocr-empty-ms"
              type="range"
              min={8}
              max={12}
              step={1}
              value={Math.round(prefs.ocrEmptyAnnounceMs / 1000)}
              className="min-h-12 w-full accent-primary"
              onChange={(event) => {
                patch({ ocrEmptyAnnounceMs: Number(event.target.value) * 1000 });
              }}
            />
            <p className="text-base text-fg-muted">
              Seconds to wait before announcing empty reading frames.
            </p>
          </div>
          <RadioGroup.Root
            className="space-y-3"
            value={prefs.performanceProfile}
            onValueChange={(value) => {
              patch({ performanceProfile: value as UserPrefs["performanceProfile"] });
            }}
            aria-label="Performance profile"
          >
            <RadioRow value="balanced" label="Balanced performance" description="Higher detection rate when the device can keep up." />
            <RadioRow value="power-save" label="Power-save" description="Lower frame rate and smaller detector input." />
          </RadioGroup.Root>
          <ToggleRow
            id="background-warnings"
            label="Background processing"
            description="Keep inference when the tab is hidden. Mobile browsers may still suspend."
            checked={prefs.backgroundWarnings}
            onCheckedChange={(checked) => patch({ backgroundWarnings: checked })}
          />
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 text-xl font-bold">Camera</legend>
          <Label htmlFor="camera-facing-assist">Default camera facing (vision, read, navigate)</Label>
          <select
            id="camera-facing-assist"
            className={fieldClass}
            value={prefs.preferredCameraFacingAssist}
            onChange={(event) => {
              patch({
                preferredCameraFacingAssist: event.target.value as "environment" | "user",
              });
            }}
          >
            <option value="environment">Rear / environment</option>
            <option value="user">Front / user</option>
          </select>
          <p className="text-base text-fg-muted">
            Used the next time assist modes request the camera. Sign language always uses the front
            camera.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void refreshCameras()}>
              List cameras
            </Button>
          </div>
          {cameraDevices.length > 0 ? (
            <>
              <Label htmlFor="camera-device-pref">Preferred camera device</Label>
              <select
                id="camera-device-pref"
                className={fieldClass}
                value={prefs.preferredCameraDeviceId ?? ""}
                onChange={(event) => {
                  patch({
                    preferredCameraDeviceId: event.target.value || null,
                  });
                }}
              >
                <option value="">System default for facing mode</option>
                {cameraDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.label}
                  </option>
                ))}
              </select>
              <p className="text-base text-fg-muted">
                Labels appear after camera permission is granted. If a session is already live,
                changing this switches the camera when supported.
              </p>
            </>
          ) : (
            <p className="text-base text-fg-muted">
              Tap List cameras after allowing camera access once so device names can appear.
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 text-xl font-bold">Language</legend>
          <Label htmlFor="language">Preferred language (BCP-47)</Label>
          <input
            id="language"
            className={fieldClass}
            value={prefs.language}
            autoComplete="language"
            onChange={(event) => patch({ language: event.target.value })}
          />
          <p className="text-base text-fg-muted">
            Hint for speech synthesis language when no voice is selected.
          </p>
          <Label htmlFor="speech-in-locale">Partner speech captions locale</Label>
          <select
            id="speech-in-locale"
            className={fieldClass}
            value={prefs.speechInLocale}
            onChange={(event) => patch({ speechInLocale: event.target.value })}
          >
            {speechInLocaleOptions(prefs.speechInLocale).map((locale) => (
              <option key={locale} value={locale}>
                {locale}
              </option>
            ))}
          </select>
          <Label htmlFor="sign-pack">Sign language pack</Label>
          <select
            id="sign-pack"
            className={fieldClass}
            value={prefs.signPackId ?? "asl"}
            onChange={(event) => {
              patch({ signPackId: event.target.value as SignLanguagePackId });
            }}
          >
            <option value="asl">ASL</option>
            <option value="sasl">SASL</option>
            <option value="bsl">BSL</option>
          </select>
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 text-xl font-bold">Muted speech categories</legend>
          <div className="space-y-2">
            {CATEGORIES.map((category) => {
              const checked = prefs.mutedCategories.includes(category.id);
              return (
                <label
                  key={category.id}
                  className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-surface-inset px-4 py-2"
                >
                  <Checkbox.Root
                    className="flex size-6 shrink-0 items-center justify-center border border-border bg-bg data-[state=checked]:bg-fg data-[state=checked]:text-bg"
                    checked={checked}
                    onCheckedChange={(next) => {
                      const muted = new Set(prefs.mutedCategories);
                      if (next === true) {
                        muted.add(category.id);
                      } else {
                        muted.delete(category.id);
                      }
                      patch({ mutedCategories: Array.from(muted) });
                    }}
                  >
                    <Checkbox.Indicator className="size-3 bg-bg" />
                  </Checkbox.Root>
                  <span className="text-lg">{category.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 text-xl font-bold">Speech input engine</legend>
          <select
            id="speech-in-engine"
            className={fieldClass}
            aria-label="Preferred speech-in engine"
            value={prefs.speechInEnginePreference}
            onChange={(event) => {
              patch({
                speechInEnginePreference: event.target
                  .value as UserPrefs["speechInEnginePreference"],
              });
            }}
          >
            <option value="auto">Auto</option>
            <option value="webspeech">Web Speech API</option>
            <option value="whisper-tiny">Whisper-tiny (not shipped)</option>
          </select>
          <p className="text-base text-fg-muted">
            Voice control and partner captions use Web Speech when available.
          </p>
        </fieldset>
      </form>

      <CapabilityList report={capabilities} heading="Device capabilities" />
    </div>
  );
}

function speechInLocaleOptions(current: string): string[] {
  const unique = new Set<string>([...SUPPORTED_SPEECH_IN_LOCALES, current]);
  return Array.from(unique);
}

function RadioRow({
  value,
  label,
  description,
}: {
  value: string;
  label: string;
  description: string;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-inset px-4 py-3">
      <RadioGroup.Item
        value={value}
        className="mt-1 size-6 shrink-0 rounded-full border border-border bg-bg data-[state=checked]:border-fg"
      >
        <RadioGroup.Indicator className="flex size-full items-center justify-center after:block after:size-2.5 after:rounded-full after:bg-fg" />
      </RadioGroup.Item>
      <span>
        <span className="block text-lg font-bold">{label}</span>
        <span className="block text-base text-fg-muted">{description}</span>
      </span>
    </label>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-surface-inset px-4 py-3">
      <div className="min-w-[12rem] flex-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-help`} className="text-base text-fg-muted">
          {description}
        </p>
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        aria-describedby={`${id}-help`}
        onCheckedChange={onCheckedChange}
        className={cn(
          "relative h-9 w-[3.25rem] shrink-0 rounded-full border border-border bg-bg data-[state=checked]:bg-primary",
        )}
      >
        <Switch.Thumb className="block size-7 translate-x-0.5 rounded-full bg-fg transition-transform data-[state=checked]:translate-x-[1.35rem] data-[state=checked]:bg-primary-fg" />
      </Switch.Root>
    </div>
  );
}
