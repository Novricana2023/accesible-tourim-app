import { describe, expect, it } from "vitest";
import { ConfidenceGate } from "@/modules/sign-language/confidenceGate";

describe("ConfidenceGate", () => {
  it("does not speak a guess below 0.75", () => {
    const gate = new ConfidenceGate({ holdMs: 0 });
    const low = gate.decide({ gloss: "HELLO", confidence: 0.4 }, 1000);
    const mid = gate.decide({ gloss: "HELLO", confidence: 0.62 }, 1100);
    expect(low.speak).toBe(false);
    expect(low.uncertainty).toBe("not-recognized");
    expect(low.gloss).toBeNull();
    expect(mid.speak).toBe(false);
    expect(mid.uncertainty).toBe("uncertain");
    expect(mid.gloss).toBe("HELLO");
  });

  it("speaks only after a high-confidence hold", () => {
    const gate = new ConfidenceGate({ holdMs: 400 });
    const first = gate.decide({ gloss: "THANK-YOU", confidence: 0.9 }, 1000);
    const held = gate.decide({ gloss: "THANK-YOU", confidence: 0.91 }, 1450);
    expect(first.speak).toBe(false);
    expect(held.speak).toBe(true);
    expect(held.gloss).toBe("THANK-YOU");
  });
});
