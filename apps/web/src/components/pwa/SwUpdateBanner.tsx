import { Button } from "@/components/ui/button";
import { onPwaNeedRefresh, reloadForPwaUpdate } from "@/lib/pwa/registerAppSw";
import { useEffect, useState } from "react";

export function SwUpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => onPwaNeedRefresh(() => setVisible(true)), []);

  if (!visible) {
    return null;
  }

  return (
    <div className="border-b border-border bg-surface-inset px-4 py-3" role="status">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base text-fg">A new version of the app is ready.</p>
        <Button variant="primary" onClick={() => reloadForPwaUpdate()}>
          Reload to update
        </Button>
      </div>
    </div>
  );
}
