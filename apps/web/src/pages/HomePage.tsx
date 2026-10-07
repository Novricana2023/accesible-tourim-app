import { APP_NAME, appDocumentTitle } from "@/app/brand";
import { FeatureCard } from "@/components/home/FeatureCard";
import { HomeHero } from "@/components/home/HomeHero";
import { useMaraSession } from "@/app/runtime";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import {
  navigateAvailability,
  readAvailability,
  signAvailability,
} from "@/lib/featureAvailability";
import { useNavigate } from "react-router-dom";

export function HomePage() {
  const navigate = useNavigate();
  const {
    mode,
    capabilities,
    prefs,
    perceptionStatus,
    ocrStatus,
    ocrAssetsOk,
    ocrAssetsReason,
    navigationStatus,
    signStatus,
    startReading,
    startNavigation,
    startCommunicate,
  } = useMaraSession();
  useDocumentTitle(appDocumentTitle());

  const read = readAvailability({
    capabilities,
    prefs,
    ocrStatus,
    ocrAssetsOk,
    ocrAssetsReason,
  });
  const nav = navigateAvailability({
    capabilities,
    mode,
    navigationStatus,
    perceptionStatus,
  });
  const sign = signAvailability({ capabilities, mode, signStatus });

  return (
    <div className="space-y-8">
      <HomeHero />

      <header className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          Choose a capability
        </h2>
        <p className="max-w-prose text-lg leading-relaxed text-fg-muted">
          {APP_NAME} helps you see, read, and communicate while traveling. Pick one mode below.
          Only one session runs at a time. When a session is active, use{" "}
          <strong className="font-semibold text-fg">Stop session</strong> in the header to release
          the camera and microphone.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <FeatureCard
          title="Navigation & vision"
          description="Rear camera, object detection, and spoken guidance for movement and safety."
          imageSrc="/features/navigate.png"
          imageAlt="Navigation and vision assistance"
          availability={nav}
          activeHint="Navigation and vision assistance is running."
          startLabel="Start navigation"
          openLabel="Open navigation"
          onStart={() => {
            void startNavigation();
          }}
          onOpen={() => {
            navigate("/navigate");
          }}
        />
        <FeatureCard
          title="Read"
          description="Read text, menus, signs, and documents aloud."
          imageSrc="/features/read.png"
          imageAlt="Read text aloud"
          availability={read}
          activeHint="Reading is running."
          startLabel="Start reading"
          openLabel="Open reading"
          onStart={() => {
            void startReading();
          }}
          onOpen={() => {
            navigate("/read");
          }}
        />
        <FeatureCard
          title="Sign language"
          description="Supported signing to speech, and partner speech to large captions."
          imageSrc="/features/sign.png"
          imageAlt="Sign language communication"
          availability={sign}
          activeHint="Sign-language communication is running."
          startLabel="Start sign language"
          openLabel="Open sign language"
          onStart={() => {
            void startCommunicate();
          }}
          onOpen={() => {
            navigate("/sign");
          }}
        />
      </div>
    </div>
  );
}
