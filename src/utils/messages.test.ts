import { describe, expect, it } from "vitest";
import { validateMessageBody } from "./messages";

describe("message validation", () => {
  it("trims valid messages", () => {
    expect(validateMessageBody("  hello  ")).toEqual({ ok: true, body: "hello" });
  });

  it("rejects empty and oversized messages", () => {
    expect(validateMessageBody("   ").ok).toBe(false);
    expect(validateMessageBody("x".repeat(501)).ok).toBe(false);
  });
});
