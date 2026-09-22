export const APP_NAME = "Tasfiri";

/** Header wordmark (includes AI branding). */
export const APP_HEADER_TITLE = `${APP_NAME} AI`;

/** PWA manifest short name (≤12 characters recommended). */
export const APP_NAME_SHORT = "Tasfiri";

export const APP_DESCRIPTION =
  "Accessible vision, reading, and navigation assistance for travel with Tasfiri.";

export function appDocumentTitle(section?: string): string {
  if (!section) return APP_NAME;
  return `${APP_NAME} | ${section}`;
}
