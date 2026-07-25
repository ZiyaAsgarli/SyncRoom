import { describe, expect, it } from "vitest";
import { copyStatusLabel } from "./copyFeedback";

describe("copy feedback", () => {
  it("maps copy states to compact labels", () => {
    expect(copyStatusLabel("idle")).toBe("Invite");
    expect(copyStatusLabel("copied")).toBe("Copied");
    expect(copyStatusLabel("failed")).toBe("Copy failed");
  });
});
