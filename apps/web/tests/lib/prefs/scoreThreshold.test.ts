import { describe, expect, it } from "vitest";
import { scoreThresholdFromSensitivity } from "@mara/shared";

describe("scoreThresholdFromSensitivity", () => {
  it("lowers threshold when sensitivity increases", () => {
    expect(scoreThresholdFromSensitivity(0)).toBeGreaterThan(
      scoreThresholdFromSensitivity(100),
    );
  });
});
