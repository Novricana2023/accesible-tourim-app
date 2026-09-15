import { describe, expect, it, vi } from "vitest";
import { getApiBaseUrl } from "@/config/env";

describe("getApiBaseUrl", () => {
  it("returns null when VITE_API_BASE_URL is unset", () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    expect(getApiBaseUrl()).toBeNull();
  });

  it("returns origin for a valid https URL in production", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/v1/");
    vi.stubEnv("PROD", true);
    vi.stubEnv("DEV", false);
    expect(getApiBaseUrl()).toBe("https://api.example.com");
  });

  it("ignores localhost in production", () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
    vi.stubEnv("PROD", true);
    vi.stubEnv("DEV", false);
    expect(getApiBaseUrl()).toBeNull();
  });
});
