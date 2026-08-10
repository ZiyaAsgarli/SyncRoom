import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/contexts/AuthContext.tsx"), "utf8");

describe("AuthContext architecture", () => {
  it("uses one canonical initial-session source", () => {
    expect(source).not.toContain("getSession(");
    expect(source).toContain("onAuthStateChange");
    expect(source).toContain("handleAuthStateSynchronously");
  });

  it("does not start profile synchronization directly from the auth callback", () => {
    const callbackStart = source.indexOf("supabase.auth.onAuthStateChange");
    const effectCleanup = source.indexOf("return () =>", callbackStart);
    const callbackRegion = source.slice(callbackStart, effectCleanup);
    expect(callbackRegion).not.toContain("privateProfileSync.sync");
    expect(callbackRegion).not.toContain("signOut()");
    expect(callbackRegion).not.toContain("checkPrivateAccess");
  });

  it("checks active access outside the auth callback without an unbounded request loop", () => {
    expect(source).toContain("await checkPrivateAccess()");
    expect(source).toContain("requestInFlight");
    expect(source).toContain("60_000");
    expect(source).toContain('addEventListener("online"');
    expect(source).toContain('addEventListener("visibilitychange"');
    expect(source).toContain("denyAndSignOut(userId, isRevokedAccessError(error))");
  });

  it("clears memory-only Drive authorization on sign-out and account changes", () => {
    expect(source).toContain('import { clearDriveToken } from "../services/driveAuth"');
    expect(source.match(/clearDriveToken\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
