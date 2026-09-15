export function LiveRegion({
  politeness,
  message,
}: {
  politeness: "assertive" | "polite";
  message: string;
}) {
  return (
    <div className="sr-only" aria-live={politeness} aria-atomic="true">
      {message}
    </div>
  );
}
