import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriveAuthSnapshot } from "../services/driveAuth";
import type { DriveMediaSource } from "../utils/driveMediaLifecycle";
import { shouldShowDriveConnect, useDriveSilentBootstrap } from "./useDriveSilentBootstrap";

const driveAuthMocks = vi.hoisted(() => ({
  token: null as string | null,
  request: vi.fn<() => Promise<string>>()
}));

vi.mock("../services/driveAuth", () => ({
  getUsableDriveAccessToken: () => driveAuthMocks.token,
  requestDriveAccessToken: driveAuthMocks.request
}));

const source: DriveMediaSource = {
  type: "google_drive",
  fileId: "Drive_File-1234567890",
  name: "private.mp4",
  mimeType: "video/mp4",
  size: 4_258_899,
  modifiedTime: "2026-07-25T00:00:00.000Z"
};
const auth: DriveAuthSnapshot = {
  authorized: false,
  tokenValid: false,
  expiresAt: null,
  expiryRemainingSeconds: 0,
  reconnectRequired: false
};

function deferredToken() {
  let resolve!: (token: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("Drive silent bootstrap", () => {
  beforeEach(() => {
    driveAuthMocks.token = null;
    driveAuthMocks.request.mockReset();
  });

  it("keeps Connect hidden during healthy bootstrap and restore", () => {
    expect(shouldShowDriveConnect("idle", false)).toBe(false);
    expect(shouldShowDriveConnect("attempting_silent_restore", false)).toBe(false);
    expect(shouldShowDriveConnect("restored", false)).toBe(false);
    expect(shouldShowDriveConnect("interaction_required", false)).toBe(true);
    expect(shouldShowDriveConnect("restored", true)).toBe(true);
  });

  it("silently restores an active Drive source once without reacting to rerenders", async () => {
    const deferred = deferredToken();
    driveAuthMocks.request.mockReturnValue(deferred.promise);
    const { result, rerender } = renderHook(({ activeSource }) => useDriveSilentBootstrap(activeSource, "approved@example.com", auth), {
      initialProps: { activeSource: source }
    });
    await waitFor(() => expect(driveAuthMocks.request).toHaveBeenCalledTimes(1));
    expect(driveAuthMocks.request).toHaveBeenCalledWith({ silent: true, forceRefresh: true, loginHint: "approved@example.com" });
    expect(result.current).toBe("attempting_silent_restore");
    rerender({ activeSource: { ...source } });
    expect(driveAuthMocks.request).toHaveBeenCalledTimes(1);
    await act(async () => deferred.resolve("memory-only-token"));
    expect(result.current).toBe("restored");
  });

  it.each(["interaction_required", "login_required"])("falls back to one interactive action for %s", async (reason) => {
    const deferred = deferredToken();
    driveAuthMocks.request.mockReturnValue(deferred.promise);
    const { result } = renderHook(() => useDriveSilentBootstrap(source, "approved@example.com", auth));
    await waitFor(() => expect(driveAuthMocks.request).toHaveBeenCalledTimes(1));
    await act(async () => deferred.reject(new Error(reason)));
    expect(result.current).toBe("interaction_required");
    expect(driveAuthMocks.request).toHaveBeenCalledTimes(1);
  });

  it("ignores completion from an old source identity", async () => {
    const first = deferredToken();
    const second = deferredToken();
    driveAuthMocks.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const sourceB = { ...source, fileId: "Drive_File-ABCDEFGHIJ" };
    const { result, rerender } = renderHook(({ activeSource }) => useDriveSilentBootstrap(activeSource, "approved@example.com", auth), {
      initialProps: { activeSource: source }
    });
    await waitFor(() => expect(driveAuthMocks.request).toHaveBeenCalledTimes(1));
    rerender({ activeSource: sourceB });
    await waitFor(() => expect(driveAuthMocks.request).toHaveBeenCalledTimes(2));
    await act(async () => first.resolve("old-source-token"));
    expect(result.current).toBe("attempting_silent_restore");
    await act(async () => second.resolve("current-source-token"));
    expect(result.current).toBe("restored");
  });
});
