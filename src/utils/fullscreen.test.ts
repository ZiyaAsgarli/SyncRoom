import { describe, expect, it, vi } from "vitest";
import { exitBrowserFullscreen, getBrowserFullscreenElement, toggleElementFullscreen, unlockScreenOrientation } from "./fullscreen";

describe("element fullscreen", () => {
  it("requests fullscreen on the dedicated player element", async () => {
    const player = document.createElement("div");
    const requestFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: requestFullscreen });
    const exitFullscreen = vi.fn(async () => undefined);

    await expect(toggleElementFullscreen(player, null, exitFullscreen)).resolves.toBe("standard");
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(exitFullscreen).not.toHaveBeenCalled();
  });

  it("uses Safari's prefixed element fullscreen API when the standard method is unavailable", async () => {
    const player = document.createElement("div");
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: undefined });
    const webkitRequestFullscreen = vi.fn();
    Object.defineProperty(player, "webkitRequestFullscreen", { configurable: true, value: webkitRequestFullscreen });

    await expect(toggleElementFullscreen(player, null, vi.fn())).resolves.toBe("webkit");
    expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("falls back to Safari's prefixed API when its exposed standard request fails", async () => {
    const player = document.createElement("div");
    const requestFullscreen = vi.fn(async () => { throw new Error("Safari standard fullscreen failed"); });
    const webkitRequestFullscreen = vi.fn();
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(player, "webkitRequestFullscreen", { configurable: true, value: webkitRequestFullscreen });

    await expect(toggleElementFullscreen(player, null, vi.fn())).resolves.toBe("webkit");
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("reports unsupported fullscreen so the watch stage can use its viewport fallback", async () => {
    const player = document.createElement("div");
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: undefined });

    await expect(toggleElementFullscreen(player, null, vi.fn())).resolves.toBe("unsupported");
  });

  it("reads and exits Safari's prefixed document fullscreen state", async () => {
    const player = document.createElement("div");
    const webkitExitFullscreen = vi.fn();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    Object.defineProperty(document, "webkitFullscreenElement", { configurable: true, value: player });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: undefined });
    Object.defineProperty(document, "webkitExitFullscreen", { configurable: true, value: webkitExitFullscreen });

    expect(getBrowserFullscreenElement(document)).toBe(player);
    await exitBrowserFullscreen(document);
    expect(webkitExitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("exits when the player is already fullscreen", async () => {
    const player = document.createElement("div");
    const requestFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: requestFullscreen });
    const exitFullscreen = vi.fn(async () => undefined);

    await toggleElementFullscreen(player, player, exitFullscreen);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("requests fullscreen before attempting a supported landscape lock", async () => {
    const calls: string[] = [];
    const player = document.createElement("div");
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: vi.fn(async () => { calls.push("fullscreen"); }) });
    const orientation = { lock: vi.fn(async () => { calls.push("landscape"); }), unlock: vi.fn() };

    await toggleElementFullscreen(player, null, vi.fn(), { orientation, preferLandscape: true });

    expect(calls).toEqual(["fullscreen", "landscape"]);
    expect(orientation.lock).toHaveBeenCalledWith("landscape");
  });

  it("keeps fullscreen successful when orientation lock is rejected", async () => {
    const player = document.createElement("div");
    const requestFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: requestFullscreen });
    const orientation = { lock: vi.fn(async () => { throw new Error("unsupported"); }) };

    await expect(toggleElementFullscreen(player, null, vi.fn(), { orientation, preferLandscape: true })).resolves.toBe("standard");
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("does not attempt orientation lock when fullscreen entry fails", async () => {
    const player = document.createElement("div");
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: vi.fn(async () => { throw new Error("denied"); }) });
    const lock = vi.fn(async () => undefined);

    await expect(toggleElementFullscreen(player, null, vi.fn(), { orientation: { lock }, preferLandscape: true })).rejects.toThrow("denied");
    expect(lock).not.toHaveBeenCalled();
  });

  it("unlocks orientation on fullscreen exit and tolerates unsupported unlock", async () => {
    const player = document.createElement("div");
    const exitFullscreen = vi.fn(async () => undefined);
    const unlock = vi.fn();

    await toggleElementFullscreen(player, player, exitFullscreen, { orientation: { unlock } });
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(() => unlockScreenOrientation({ unlock: () => { throw new Error("unsupported"); } })).not.toThrow();
  });
});
