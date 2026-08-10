import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../types/database";
import { createProfileSyncCoordinator, isRevokedAccessError, isTransientProfileSyncError, isUnauthorizedProfileError, shouldSignOutForProfileSyncError } from "./profileSyncCoordinator";

const profile: Profile = {
  user_id: "user-1",
  email: "private@example.test",
  full_name: "Private User",
  avatar_url: null,
  private_role: "owner",
  created_at: "",
  updated_at: ""
};

describe("profile sync coordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses one profile sync call for concurrent callers", async () => {
    const sync = vi.fn(async () => profile);
    const coordinator = createProfileSyncCoordinator(sync, { baseDelayMs: 1 });
    const [first, second] = await Promise.all([coordinator.sync("user-1"), coordinator.sync("user-1")]);
    expect(first).toBe(profile);
    expect(second).toBe(profile);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("does not resync after a cached successful profile state update", async () => {
    const sync = vi.fn(async () => profile);
    const coordinator = createProfileSyncCoordinator(sync, { baseDelayMs: 1 });
    await coordinator.sync("user-1");
    await coordinator.sync("user-1");
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("treats StrictMode-style duplicate initialization as one request", async () => {
    let resolve!: (value: Profile) => void;
    const pending = new Promise<Profile>((next) => { resolve = next; });
    const sync = vi.fn(() => pending);
    const coordinator = createProfileSyncCoordinator(sync, { baseDelayMs: 1 });
    const first = coordinator.sync("user-1");
    const second = coordinator.sync("user-1");
    resolve(profile);
    await Promise.all([first, second]);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("retries transient PGRST003 failures and recovers", async () => {
    const sync = vi
      .fn<() => Promise<Profile>>()
      .mockRejectedValueOnce({ code: "PGRST003", message: "Timed out acquiring connection from connection pool." })
      .mockResolvedValueOnce(profile);
    const coordinator = createProfileSyncCoordinator(sync, { baseDelayMs: 1 });
    await expect(coordinator.sync("user-1", { force: true })).resolves.toBe(profile);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("clears an in-flight request on success", async () => {
    const sync = vi.fn(async () => profile);
    const coordinator = createProfileSyncCoordinator(sync, { baseDelayMs: 1 });
    await coordinator.sync("user-1", { force: true });
    expect(coordinator.hasInFlight("user-1")).toBe(false);
  });

  it("clears an in-flight request on failure", async () => {
    const sync = vi.fn<() => Promise<Profile>>().mockRejectedValue({ code: "42501", message: "not invited" });
    const coordinator = createProfileSyncCoordinator(sync, { retryLimit: 0, baseDelayMs: 1 });
    await expect(coordinator.sync("user-1", { force: true })).rejects.toMatchObject({ code: "42501" });
    expect(coordinator.hasInFlight("user-1")).toBe(false);
  });

  it("clears an in-flight request on timeout", async () => {
    vi.useFakeTimers();
    const sync = vi.fn(() => new Promise<Profile>(() => undefined));
    const coordinator = createProfileSyncCoordinator(sync, { retryLimit: 0, timeoutMs: 10, baseDelayMs: 1 });
    const request = coordinator.sync("user-1", { force: true });
    expect(coordinator.hasInFlight("user-1")).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    await expect(request).rejects.toMatchObject({ code: "SYNC_PROFILE_TIMEOUT" });
    expect(coordinator.hasInFlight("user-1")).toBe(false);
  });

  it("retry after timeout creates a new RPC request", async () => {
    vi.useFakeTimers();
    const sync = vi
      .fn<() => Promise<Profile>>()
      .mockImplementationOnce(() => new Promise<Profile>(() => undefined))
      .mockResolvedValueOnce(profile);
    const coordinator = createProfileSyncCoordinator(sync, { retryLimit: 0, timeoutMs: 10, baseDelayMs: 1 });
    const first = coordinator.sync("user-1", { force: true });
    await vi.advanceTimersByTimeAsync(10);
    await expect(first).rejects.toMatchObject({ code: "SYNC_PROFILE_TIMEOUT" });
    await expect(coordinator.sync("user-1", { force: true })).resolves.toBe(profile);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("does not share in-flight requests between users", async () => {
    const sync = vi.fn(async () => profile);
    const coordinator = createProfileSyncCoordinator(sync, { baseDelayMs: 1 });
    await Promise.all([coordinator.sync("user-1", { force: true }), coordinator.sync("user-2", { force: true })]);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("classifies timeout as transient and unauthorized separately", () => {
    expect(isTransientProfileSyncError({ code: "PGRST003", status: 504 })).toBe(true);
    expect(isUnauthorizedProfileError({ code: "42501", message: "not invited" })).toBe(true);
    expect(isUnauthorizedProfileError({ code: "42501", message: "A protected operation was denied" })).toBe(false);
    expect(isUnauthorizedProfileError({ code: "PGRST003", status: 504 })).toBe(false);
  });

  it("does not sign out for PGRST003 or 504, but does for unauthorized", () => {
    expect(shouldSignOutForProfileSyncError({ code: "PGRST003", status: 504 })).toBe(false);
    expect(shouldSignOutForProfileSyncError({ status: 504, message: "Gateway Timeout" })).toBe(false);
    expect(shouldSignOutForProfileSyncError({ code: "42501", message: "not invited" })).toBe(true);
  });

  it("distinguishes revoked access from an unknown account without weakening denial", () => {
    expect(isRevokedAccessError({ code: "42501", message: "Your access to this private SyncRoom has been removed" })).toBe(true);
    expect(isRevokedAccessError({ code: "42501", message: "This Google account is not invited" })).toBe(false);
    expect(shouldSignOutForProfileSyncError({ code: "42501", message: "Your access has been removed" })).toBe(true);
  });
});
