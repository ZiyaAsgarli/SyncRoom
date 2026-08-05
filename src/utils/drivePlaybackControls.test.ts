import { describe, expect, it } from "vitest";
import { isAutoplayPolicyError } from "./drivePlaybackControls";

describe("Drive video surface controls", () => {
  it("recognizes browser autoplay rejection", () => {
    expect(isAutoplayPolicyError(new DOMException("blocked", "NotAllowedError"))).toBe(true);
    expect(isAutoplayPolicyError(new Error("network"))).toBe(false);
  });
});
