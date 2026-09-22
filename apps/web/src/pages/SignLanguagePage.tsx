import { CameraPreview } from "@/components/CameraPreview";
import { ModeScreen } from "@/components/modes/ModeScreen";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { APP_NAME, appDocumentTitle } from "@/app/brand";
import { useMara } from "@/app/runtime";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { signAvailability } from "@/lib/featureAvailability";
import {
  COMMUNICATION_ECHO_RULE,
  EXPERIMENTAL_BANNER,
  SIGN_SPOKEN_OUTPUT_HINT,
  listVocabulary,
  type SignViewState,
} from "@/modules/sign-language";
import { partnerSpeechDisclosure } from "@/modules/speech/SttAdapter";
import { ArrowRight, Hand, Mic } from "lucide-react";

export function SignLanguagePage() {
  const {
    mode,
    capabilities,
    prefs,
    camera,
    cameraStatus,
    signView,
    communication,
    voiceStatus,
    voiceEngine,
    voiceFailure,
    startCommunicate,
    stopSignerChannel,
    startSpeakerListening,
    stopSpeakerListening,
  } = useMara();
  useDocumentTitle(appDocumentTitle("Sign language"));

  const active = mode === "communicate";
  const cameraOk = capabilities?.available.camera ?? false;
  const signerLive =
    active && (signView.status === "live" || signView.status === "loading");
  const showSignerCamera =
    signerLive ||
    (active &&
      (cameraStatus === "denied" ||
        cameraStatus === "unavailable" ||
        cameraStatus === "error" ||
        cameraStatus === "requesting"));
  const speakerListening =
    active &&
    (voiceStatus === "listening" ||
      voiceStatus === "paused" ||
      voiceStatus === "requesting");
  const packId = prefs.signPackId ?? "asl";
  const packLabel = packId.toUpperCase();
  const vocabulary =
    signView.vocabulary.length > 0 ? signView.vocabulary : listVocabulary(packId);
  const uncertaintyLabel = uncertaintyText(signView.uncertainty, signView.lastGloss);
  const speakerCaption =
    communication.speakerLiveText || communication.lastSpeakerText;
  const signerPhrase = signView.lastSpokenText || communication.lastSignerText;
  const sttUnavailable = voiceEngine === "unavailable" && voiceStatus !== "denied";
  const availability = signAvailability({ capabilities, mode, signStatus: signView.status });
  const uiStatus = signerLive || speakerListening ? "active" : availability.status;

  return (
    <ModeScreen
      title="Sign language"
      subtitle="Two separate channels for signing and spoken partners. Isolated signs from a closed vocabulary only, not sentence translation."
      status={uiStatus}
      statusText={
        active
          ? communicateStatus(signerLive, speakerListening)
          : "Sign-language communication is not running."
      }
    >
      <p
        className="border-s-4 border-warning bg-warning-bg px-4 py-3 text-base leading-relaxed text-fg"
        role="note"
      >
        {EXPERIMENTAL_BANNER}
      </p>
      <p className="text-base text-fg-muted">
        Pack: <strong className="font-semibold text-fg">{packLabel}</strong>. Partner
        captions locale:{" "}
        <strong className="font-semibold text-fg">{prefs.speechInLocale}</strong>.
      </p>
      <p className="text-base text-fg-muted" role="note">
        {SIGN_SPOKEN_OUTPUT_HINT}
      </p>
      <details className="rounded-lg border border-border bg-surface-inset px-4 py-3">
        <summary className="cursor-pointer text-base font-semibold text-fg">
          How signing and partner speech interact
        </summary>
        <p className="mt-3 text-base leading-relaxed text-fg-muted">{COMMUNICATION_ECHO_RULE}</p>
      </details>
      {active ? (
        <p className="text-base text-fg-muted">
          To end both channels, use <strong className="font-semibold text-fg">Stop session</strong>{" "}
          in the header.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader icon={<Hand className="size-6" strokeWidth={1.75} />}>
            <h2 className="text-2xl font-bold">Sign to speech</h2>
            <p className="mt-1 text-base text-fg-muted">
              Front camera, hand tracking, and optional isolated-sign recognition.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            {showSignerCamera ? (
              <CameraPreview
                service={camera}
                visualOverlay={false}
                preferredFacingLabel="front"
                userFriendly
              />
            ) : null}

            <p className="text-lg" role="status">
              {signerLive
                ? signView.landmarksReady
                  ? `Hand tracking is on. Hands in frame: ${signView.handsDetected}.`
                  : "Hand tracking is starting."
                : "Signer camera is off."}{" "}
              {signerLive
                ? signView.classifierReady
                  ? signView.reason?.includes("hand-shape assist")
                    ? signView.reason
                    : "Classifier loaded."
                  : `No trained classifier. ${APP_NAME} will not guess signs.`
                : null}
            </p>

            {signerLive ? (
              <>
                <p className="text-lg">{uncertaintyLabel}</p>
                {signView.reason ? (
                  <p className="text-base text-fg-muted">{signView.reason}</p>
                ) : null}
              </>
            ) : null}

            <div
              className="border-s-4 border-primary bg-surface-inset px-4 py-5"
              aria-labelledby="signer-output-heading"
            >
              <h3 id="signer-output-heading" className="text-sm font-semibold text-fg-muted">
                Recognized phrase
              </h3>
              <p
                className="mt-2 break-words text-2xl font-bold leading-tight text-fg sm:text-3xl"
                role="status"
              >
                {signerPhrase ?? "No mapped phrase yet."}
              </p>
            </div>

            <div role="group" aria-label="Signer channel actions" className="flex flex-col gap-3">
              {signerLive &&
              cameraStatus !== "denied" &&
              cameraStatus !== "unavailable" &&
              cameraStatus !== "error" &&
              cameraStatus !== "idle" ? (
                <Button
                  variant="secondary"
                  size="large"
                  onClick={() => {
                    void stopSignerChannel();
                  }}
                >
                  Stop signer camera
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="large"
                  disabled={!cameraOk}
                  onClick={() => {
                    void startCommunicate();
                  }}
                >
                  Start signer camera
                </Button>
              )}
            </div>

            <details className="rounded-lg border border-border bg-surface-inset px-4 py-3">
              <summary className="cursor-pointer text-base font-bold">
                Supported vocabulary ({vocabulary.length})
              </summary>
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto" aria-label="Supported signs">
                {vocabulary.map((entry) => (
                  <li key={entry.gloss} className="text-base">
                    {entry.gloss}: {entry.spokenText}
                  </li>
                ))}
              </ul>
            </details>
          </CardBody>
        </Card>

        <Card className="h-full">
          <CardHeader icon={<Mic className="size-6" strokeWidth={1.75} />}>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">Speech to text</h2>
              <ArrowRight className="size-5 text-fg-subtle lg:hidden" aria-hidden />
            </div>
            <p className="mt-1 text-base text-fg-muted">
              Partner speech as large captions. {APP_NAME} does not animate signs or rewrite
              transcripts.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-lg" role="status">
              {speakerListening
                ? voiceStatus === "paused"
                  ? `Listening paused while ${APP_NAME} is speaking.`
                  : "Listening for the speaking partner."
                : voiceStatus === "denied"
                  ? "Microphone permission was denied."
                  : voiceFailure === "network"
                    ? "Speech recognition lost network connection."
                    : sttUnavailable
                      ? partnerSpeechDisclosure("unavailable")
                      : "Partner listening is off."}
            </p>
            <p className="text-sm text-fg-muted">{partnerSpeechDisclosure(voiceEngine)}</p>

            <div
              className="border-s-4 border-primary bg-surface-inset px-4 py-6 sm:py-8"
              aria-labelledby="partner-caption-heading"
            >
              <h3 id="partner-caption-heading" className="text-sm font-semibold text-fg-muted">
                Partner speech
              </h3>
              <p
                className="mt-3 break-words text-3xl font-bold leading-tight text-fg sm:text-4xl"
                role="status"
                aria-live="polite"
              >
                {speakerCaption ?? "No partner speech yet."}
              </p>
            </div>

            <div role="group" aria-label="Speaker channel actions" className="flex flex-col gap-3">
              {speakerListening ? (
                <Button
                  variant="secondary"
                  size="large"
                  onClick={() => {
                    void stopSpeakerListening();
                  }}
                >
                  Stop partner listening
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="large"
                  disabled={sttUnavailable}
                  onClick={() => {
                    void startSpeakerListening();
                  }}
                >
                  Start partner listening
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </ModeScreen>
  );
}

function communicateStatus(signerLive: boolean, speakerListening: boolean): string {
  if (signerLive && speakerListening) {
    return "Signer camera and partner listening are both running.";
  }
  if (signerLive) {
    return "Signer camera is running.";
  }
  if (speakerListening) {
    return "Partner listening is running.";
  }
  return "Communication mode is on. Start a channel below.";
}

function uncertaintyText(
  uncertainty: SignViewState["uncertainty"],
  gloss: string | null,
): string {
  if (uncertainty === "pack-not-loaded") {
    return `Classifier unavailable. Vocabulary is listed; ${APP_NAME} will not invent glosses.`;
  }
  if (uncertainty === "uncertain" && gloss) {
    return `Uncertain: did you sign ${gloss}? ${APP_NAME} will not speak a guess.`;
  }
  if (uncertainty === "not-recognized") {
    return "Not recognized.";
  }
  if (gloss) {
    return `Recognized ${gloss}.`;
  }
  return "Waiting for an isolated sign from the vocabulary.";
}
