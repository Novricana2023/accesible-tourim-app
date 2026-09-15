import type { UserPrefs } from "@mara/shared";

const ROOT_CLASS = {
  textScale: {
    default: "a11y-text-default",
    large: "a11y-text-large",
    xlarge: "a11y-text-xlarge",
  },
  highContrast: "a11y-high-contrast",
  reduceMotion: "a11y-reduce-motion",
} as const;

export function applyAccessibilityPrefs(prefs: UserPrefs): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.classList.remove(
    ROOT_CLASS.textScale.default,
    ROOT_CLASS.textScale.large,
    ROOT_CLASS.textScale.xlarge,
    ROOT_CLASS.highContrast,
    ROOT_CLASS.reduceMotion,
  );
  root.classList.add(ROOT_CLASS.textScale[prefs.textScale]);
  if (prefs.highContrast) {
    root.classList.add(ROOT_CLASS.highContrast);
  }
  if (prefs.reduceMotion) {
    root.classList.add(ROOT_CLASS.reduceMotion);
  }
}
