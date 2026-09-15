import { describe, expect, it } from "vitest";

/** Canonical client routes (must match `src/app/routes.tsx` and Vercel SPA rewrites). */
export const APP_ROUTE_PATHS = [
  "/",
  "/vision",
  "/read",
  "/navigate",
  "/sign",
  "/settings",
  "/assist",
  "/communicate",
] as const;

describe("frontend routes", () => {
  it("lists all primary SPA paths for deployment verification", () => {
    expect(APP_ROUTE_PATHS).toHaveLength(8);
    expect(new Set(APP_ROUTE_PATHS).size).toBe(APP_ROUTE_PATHS.length);
  });
});
