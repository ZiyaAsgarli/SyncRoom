import { describe, expect, it } from "vitest";
import { canManageGuestAccess, normalizeGuestEmail, validateGuestEmail } from "./guestAccess";

describe("guest access utilities", () => {
  it("normalizes uppercase and surrounding whitespace", () => {
    expect(normalizeGuestEmail("  Guest.Name@Example.COM  ")).toBe("guest.name@example.com");
    expect(validateGuestEmail("  Guest.Name@Example.COM  ")).toEqual({ ok: true, email: "guest.name@example.com" });
  });

  it("rejects malformed and oversized email values", () => {
    expect(validateGuestEmail("not-an-email").ok).toBe(false);
    expect(validateGuestEmail(`${"a".repeat(245)}@example.com`).ok).toBe(false);
  });

  it("does not allow the owner to add their own normalized email", () => {
    expect(validateGuestEmail("OWNER@example.com", " owner@EXAMPLE.com ")).toEqual({
      ok: false,
      error: "Your owner account cannot be added as a guest."
    });
  });

  it("grants management UI only to the owner role", () => {
    expect(canManageGuestAccess("owner")).toBe(true);
    expect(canManageGuestAccess("friend")).toBe(false);
  });
});
