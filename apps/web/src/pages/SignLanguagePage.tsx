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
import { isAppleMobile } from "@/lib/isAppleMobile";
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
    testSignSpeechOutput,
    speakSignGloss,
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
      {isAppleMobile() ? (
        <p className="text-base text-fg-muted" role="note">
          iPhone/iPad: use Safari or Chrome, tap <strong className="font-semibold text-fg">Test speaker</strong>{" "}
          once so iOS allows spoken output. Partner speech-to-text is limited on iOS; use Android Chrome or a laptop
          for reliable captions. Sign recognition is slower than on Android or a laptop.
        </p>
      ) : null}
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
                  ? signView.handsDetected > 0
                    ? `Hand tracking is on. Hands in frame: ${signView.handsDetected}.`
                    : "Hand tracking is on. Show your hands to the front camera, or tap Speak below."
                  : "Hand tracking is starting. If this stays more than a minute, reload and check your connection."
                : "Signer camera is off."}{" "}
              {signerLive
                ? signAssistStatusLabel(signView)
                : null}
            </p>

            {signerLive ? (
              <>
                <p className="text-lg">{uncertaintyLabel}</p>
                {signView.reason && !signView.reason.includes("Loading sign") ? (
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
              <Button
                type="button"
                variant="secondary"
                size="large"
                onClick={() => {
                  testSignSpeechOutput();
                }}
              >
                Test speaker
              </Button>
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
                    testSignSpeechOutput();
                    void startCommunicate();
                  }}
                >
                  Start signer camera
                </Button>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-surface-inset px-4 py-4">
              <h3 className="text-base font-bold">Speak a word aloud</h3>
              <p className="text-sm text-fg-muted">
                Tap after signing, or if the camera did not recognize your sign. The partner will
                hear the spoken phrase.
              </p>
              <ul
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                aria-label="Speak vocabulary aloud"
              >
                {vocabulary.map((entry) => (
                  <li key={entry.gloss}>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-auto min-h-12 w-full py-2 text-base"
                      disabled={!signerLive}
                      onClick={() => {
                        speakSignGloss(entry.gloss);
                      }}
                    >
                      Speak {entry.spokenText}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
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

function signAssistStatusLabel(view: SignViewState): string {
  if (view.classifierId === "heuristic-isolated-sign") {
    return (
      view.reason ??
      "Basic hand-shape assist is active (no trained ASL ONNX on server). Use Speak buttons if signs are not recognized."
    );
  }
  if (view.classifierReady) {
    return view.landmarksReady
      ? "Hand tracking and sign assist are ready."
      : "Sign assist is ready. Hand tracking is still starting.";
  }
  if (view.landmarksReady) {
    return "Hand tracking is on. No trained classifier for this pack — use Speak below.";
  }
  return "Starting sign assist. If this fails, open Settings with ?debug=1 and check model URLs.";
}

function uncertaintyText(
  uncertainty: SignViewState["uncertainty"],
  gloss: string | null,
): string {
  if (uncertainty === "pack-not-loaded") {
    return `Sign classifier unavailable for this pack. Use Speak buttons for vocabulary words.`;
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
