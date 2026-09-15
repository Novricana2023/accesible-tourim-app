import { useEffect, useState } from "react";

export function useNetworkStatus(): { online: boolean; since: number } {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [since, setSince] = useState(() => Date.now());

  useEffect(() => {
    const mark = (next: boolean) => {
      setOnline(next);
      setSince(Date.now());
    };
    const on = () => mark(true);
    const off = () => mark(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return { online, since };
}
