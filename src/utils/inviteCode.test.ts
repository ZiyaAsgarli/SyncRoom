import { describe, expect, it } from "vitest";
import { isInviteCodeLike, normalizeInviteCode } from "./inviteCode";

describe("invite code utilities", () => {
  it("normalizes spacing, case, and separators", () => {
    expect(normalizeInviteCode(" ab-c 123 ")).toBe("ABC123");
  });

  it("recognizes valid private invite code shape", () => {
    expect(isInviteCodeLike("abc1234")).toBe(true);
    expect(isInviteCodeLike("abc")).toBe(false);
  });
});
