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
  });
});
