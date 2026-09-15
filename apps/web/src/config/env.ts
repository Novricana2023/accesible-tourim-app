const LOCALHOST_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/**
 * Optional production API origin. Returns null when unset or invalid for production.
 * The app does not require a backend; this is for future integrations only.
 */
export function getApiBaseUrl(): string | null {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!raw) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    if (import.meta.env.DEV) {
      console.warn("[env] VITE_API_BASE_URL is not a valid URL; ignoring.");
    }
    return null;
  }

  if (import.meta.env.PROD && LOCALHOST_HOST.test(parsed.hostname)) {
    console.warn(
      "[env] VITE_API_BASE_URL points at localhost in a production build; ignoring.",
    );
    return null;
  }

  if (import.meta.env.PROD && parsed.protocol !== "https:") {
    console.warn("[env] VITE_API_BASE_URL must use https in production; ignoring.");
    return null;
  }

  return parsed.origin;
}

/** Warn once in production if env looks misconfigured (does not block the app). */
export function assertProductionEnv(): void {
  if (!import.meta.env.PROD) {
    return;
  }
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!raw) {
    return;
  }
  getApiBaseUrl();
}
