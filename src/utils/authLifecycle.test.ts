import { describe, expect, it, vi } from "vitest";
import { handleAuthStateSynchronously, isStaleProfileResult } from "./authLifecycle";

describe("auth lifecycle helpers", () => {
  it("auth callback returns synchronously without starting profile RPC work", () => {
    const order: string[] = [];
    const profileSync = vi.fn();
    handleAuthStateSynchronously("INITIAL_SESSION", null, {
      setInitialSessionResolved: () => order.push("resolved"),
      setAuthLoading: () => order.push("auth-loading"),
      setSession: () => order.push("session"),
      handleSignedOut: () => order.push("signed-out"),
      log: (message) => order.push(message.endsWith("returned") ? "returned" : "entered")
    });
    order.push("after-callback");
    expect(order).toEqual(["entered", "resolved", "auth-loading", "session", "returned", "after-callback"]);
    expect(profileSync).not.toHaveBeenCalled();
  });

  it("SIGNED_OUT clears local state synchronously without recursive signOut", () => {
    const signOut = vi.fn();
    const clear = vi.fn();
    handleAuthStateSynchronously("SIGNED_OUT", null, {
      setInitialSessionResolved: vi.fn(),
      setAuthLoading: vi.fn(),
      setSession: vi.fn(),
      handleSignedOut: clear
    });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("detects stale profile results from previous users or generations", () => {
    expect(isStaleProfileResult({ capturedGeneration: 1, currentGeneration: 1, capturedUserId: "a", currentUserId: "a", cancelled: false })).toBe(false);
    expect(isStaleProfileResult({ capturedGeneration: 1, currentGeneration: 2, capturedUserId: "a", currentUserId: "a", cancelled: false })).toBe(true);
    expect(isStaleProfileResult({ capturedGeneration: 1, currentGeneration: 1, capturedUserId: "a", currentUserId: "b", cancelled: false })).toBe(true);
    expect(isStaleProfileResult({ capturedGeneration: 1, currentGeneration: 1, capturedUserId: "a", currentUserId: "a", cancelled: true })).toBe(true);
  });
});
