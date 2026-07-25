import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriveAuthSnapshot } from "../services/driveAuth";
import type { DriveMediaBinding } from "../services/driveServiceWorker";
import type { DriveMediaSource } from "../utils/driveMediaLifecycle";
import { useDriveMediaLifecycle } from "./useDriveMediaLifecycle";

const serviceWorkerMocks = vi.hoisted(() => ({
  bind: vi.fn(),
  clear: vi.fn(async () => true)
}));

vi.mock("../services/driveAuth", () => ({
  getUsableDriveAccessToken: () => "memory-only-drive-token"
}));

vi.mock("../services/driveServiceWorker", () => ({
  bindDriveMediaSession: serviceWorkerMocks.bind,
  clearDriveMediaSession: serviceWorkerMocks.clear,
  driveMediaUrl: (fileId: string, generation: number) => `/__syncroom_drive_media__/${fileId}?generation=${generation}`
}));

const sourceA: DriveMediaSource = {
  type: "google_drive",
  fileId: "Drive_File-1234567890",
  name: "a.mp4",
  mimeType: "video/mp4",
  size: 4_258_899,
  modifiedTime: "2026-07-25T00:00:00.000Z"
};

const sourceB: DriveMediaSource = { ...sourceA, fileId: "Drive_File-ABCDEFGHIJ", name: "b.mp4" };
const auth: DriveAuthSnapshot = { authorized: true, tokenValid: true, expiresAt: 10_000_000, expiryRemainingSeconds: 3600, reconnectRequired: false };

function deferredBinding() {
  let resolve!: (binding: DriveMediaBinding) => void;
  const promise = new Promise<DriveMediaBinding>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("useDriveMediaLifecycle", () => {
  beforeEach(() => {
    serviceWorkerMocks.bind.mockReset();
    serviceWorkerMocks.clear.mockClear();
    vi.restoreAllMocks();
  });

  it("does not attach media src before the matching bind ACK", async () => {
    const deferred = deferredBinding();
    serviceWorkerMocks.bind.mockReturnValue(deferred.promise);
    const { result } = renderHook(() => useDriveMediaLifecycle(sourceA, auth));
    await waitFor(() => expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(1));
    expect(result.current.mediaSrc).toBeNull();
    const generation = result.current.state.generation;
    act(() => deferred.resolve({ generation, fileId: sourceA.fileId, mimeType: sourceA.mimeType, fileSizeBytes: sourceA.size ?? 0 }));
    await waitFor(() => expect(result.current.mediaSrc).toContain(`generation=${generation}`));
  });

  it("recovers one failed initial bind before attaching media src", async () => {
    serviceWorkerMocks.bind
      .mockRejectedValueOnce(new Error("bind acknowledgement timed out"))
      .mockImplementationOnce(async (generation: number, fileId: string, _token: string, options: { mimeType: "video/mp4"; fileSizeBytes: number }) => ({ generation, fileId, ...options }));
    const { result } = renderHook(() => useDriveMediaLifecycle(sourceA, auth));
    await waitFor(() => expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.mediaSrc).not.toBeNull());
    expect(serviceWorkerMocks.bind.mock.calls[1][4]).toBe(true);
  });

  it("bounds initial bind recovery to one forced retry", async () => {
    serviceWorkerMocks.bind.mockRejectedValue(new Error("worker unavailable"));
    const { result } = renderHook(() => useDriveMediaLifecycle(sourceA, auth));
    await waitFor(() => expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(2);
    expect(result.current.mediaSrc).toBeNull();
    expect(result.current.state.phase).toBe("RECOVERING");
  });

  it("ignores a stale bind ACK after the active source changes", async () => {
    const first = deferredBinding();
    const second = deferredBinding();
    let bindCalls = 0;
    serviceWorkerMocks.bind.mockImplementation(() => {
      bindCalls += 1;
      return bindCalls === 1 ? first.promise : second.promise;
    });
    const { result, rerender } = renderHook(({ source }) => useDriveMediaLifecycle(source, auth), { initialProps: { source: sourceA } });
    await waitFor(() => expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(1));
    const firstGeneration = result.current.state.generation;
    rerender({ source: sourceB });
    await waitFor(() => expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(2));
    const secondGeneration = result.current.state.generation;
    act(() => first.resolve({ generation: firstGeneration, fileId: sourceA.fileId, mimeType: sourceA.mimeType, fileSizeBytes: sourceA.size ?? 0 }));
    expect(result.current.mediaSrc).toBeNull();
    act(() => second.resolve({ generation: secondGeneration, fileId: sourceB.fileId, mimeType: sourceB.mimeType, fileSizeBytes: sourceB.size ?? 0 }));
    await waitFor(() => expect(result.current.mediaSrc).toContain(sourceB.fileId));
  });

  it("does not rebind or churn src across 100 unrelated rerenders", async () => {
    serviceWorkerMocks.bind.mockImplementation(async (generation: number, fileId: string, _token: string, options: { mimeType: "video/mp4"; fileSizeBytes: number }) => ({ generation, fileId, ...options }));
    const { result, rerender } = renderHook(({ source }) => useDriveMediaLifecycle(source, auth), { initialProps: { source: sourceA } });
    await waitFor(() => expect(result.current.mediaSrc).not.toBeNull());
    const originalSrc = result.current.mediaSrc;
    const originalGeneration = result.current.state.generation;
    for (let index = 0; index < 120; index += 1) rerender({ source: { ...sourceA } });
    expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(1);
    expect(result.current.mediaSrc).toBe(originalSrc);
    expect(result.current.state.generation).toBe(originalGeneration);
  });

  it("atomically rebinds token refresh without resetting media src", async () => {
    serviceWorkerMocks.bind.mockImplementation(async (generation: number, fileId: string, _token: string, options: { mimeType: "video/mp4"; fileSizeBytes: number }) => ({ generation, fileId, ...options }));
    const { result, rerender } = renderHook(({ authState }) => useDriveMediaLifecycle(sourceA, authState), { initialProps: { authState: auth } });
    await waitFor(() => expect(result.current.mediaSrc).not.toBeNull());
    const originalSrc = result.current.mediaSrc;
    rerender({ authState: { ...auth, expiresAt: auth.expiresAt! + 3_600_000 } });
    await waitFor(() => expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(2));
    expect(result.current.mediaSrc).toBe(originalSrc);
  });

  it("queues one token replacement behind an unresolved bind ACK", async () => {
    const initial = deferredBinding();
    serviceWorkerMocks.bind
      .mockReturnValueOnce(initial.promise)
      .mockImplementationOnce(async (generation: number, fileId: string, _token: string, options: { mimeType: "video/mp4"; fileSizeBytes: number }) => ({ generation, fileId, ...options }));
    const { result, rerender } = renderHook(({ authState }) => useDriveMediaLifecycle(sourceA, authState), { initialProps: { authState: auth } });
    await waitFor(() => expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(1));
    const generation = result.current.state.generation;
    rerender({ authState: { ...auth, expiresAt: auth.expiresAt! + 3_600_000 } });
    expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(1);
    act(() => initial.resolve({ generation, fileId: sourceA.fileId, mimeType: sourceA.mimeType, fileSizeBytes: sourceA.size ?? 0 }));
    await waitFor(() => expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.mediaSrc).toContain(`generation=${generation}`));
    expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(2);
  });

  it("performs one controlled rebind when the worker session is missing", async () => {
    serviceWorkerMocks.bind.mockImplementation(async (generation: number, fileId: string, _token: string, options: { mimeType: "video/mp4"; fileSizeBytes: number }) => ({ generation, fileId, ...options }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 428, headers: { "X-SyncRoom-Drive-Error": "DRIVE_SESSION_NOT_BOUND" } }));
    const { result } = renderHook(() => useDriveMediaLifecycle(sourceA, auth));
    await waitFor(() => expect(result.current.mediaSrc).not.toBeNull());
    let recovery: { recovered: boolean; code: string } | undefined;
    await act(async () => {
      recovery = await result.current.recover({ mediaErrorCode: 4 });
    });
    expect(recovery).toEqual({ recovered: true, code: "DRIVE_SESSION_NOT_BOUND" });
    expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(2);
    expect(serviceWorkerMocks.bind.mock.calls[1][4]).toBe(true);
    expect(result.current.errorMessage).toBeNull();
  });

  it("bounds failed automatic recovery and does not loop", async () => {
    serviceWorkerMocks.bind
      .mockImplementationOnce(async (generation: number, fileId: string, _token: string, options: { mimeType: "video/mp4"; fileSizeBytes: number }) => ({ generation, fileId, ...options }))
      .mockRejectedValueOnce(new Error("worker unavailable"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 428, headers: { "X-SyncRoom-Drive-Error": "DRIVE_SESSION_NOT_BOUND" } }));
    const { result } = renderHook(() => useDriveMediaLifecycle(sourceA, auth));
    await waitFor(() => expect(result.current.mediaSrc).not.toBeNull());
    await act(async () => {
      expect((await result.current.recover({ mediaErrorCode: 4 })).recovered).toBe(false);
      expect((await result.current.recover({ mediaErrorCode: 4 })).recovered).toBe(false);
    });
    expect(serviceWorkerMocks.bind).toHaveBeenCalledTimes(2);
  });
});
