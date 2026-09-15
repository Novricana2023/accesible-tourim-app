import { Badge, statusLabel, statusToBadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { FeatureAvailability } from "@/lib/featureAvailability";

export function FeatureCard({
  title,
  description,
  imageSrc,
  imageAlt,
  availability,
  activeHint,
  startLabel,
  openLabel,
  onStart,
  onOpen,
}: {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  availability: FeatureAvailability;
  activeHint?: string;
  startLabel: string;
  openLabel: string;
  onStart: () => void;
  onOpen: () => void;
}) {
  const disabled = availability.status === "unavailable" || availability.status === "checking";
  const isActive = availability.status === "active";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader imageSrc={imageSrc} imageAlt={imageAlt}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-2xl font-bold leading-tight text-fg">{title}</h2>
          {availability.status !== "ready" ? (
            <Badge tone={statusToBadgeTone(availability.status)}>
              {statusLabel(availability.status)}
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 text-lg text-fg-muted">{description}</p>
      </CardHeader>
      <CardBody className="mt-auto flex flex-col gap-3">
        {availability.reason ? (
          <p className="text-base text-fg-muted" role="status">
            {availability.reason}
          </p>
        ) : isActive && activeHint ? (
          <p className="text-base text-success" role="status">
            {activeHint}
          </p>
        ) : null}
        {isActive ? (
          <Button variant="primary" size="large" onClick={onOpen}>
            {openLabel}
          </Button>
        ) : (
          <Button variant="primary" size="large" disabled={disabled} onClick={onStart}>
            {availability.status === "checking" ? "Checking device…" : startLabel}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
