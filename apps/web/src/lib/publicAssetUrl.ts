/**
 * Resolve static asset paths for production (respects Vite `base`, never localhost).
 */
export function publicAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const path = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
  if (typeof window !== "undefined") {
    return new URL(path, `${window.location.origin}${normalizedBase}`).href;
  }
  return `${normalizedBase}${path}`;
}
