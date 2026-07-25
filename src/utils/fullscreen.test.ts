import { describe, expect, it, vi } from "vitest";
import { toggleElementFullscreen } from "./fullscreen";

describe("element fullscreen", () => {
  it("requests fullscreen on the dedicated player element", async () => {
    const player = document.createElement("div");
    const requestFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(player, "requestFullscreen", { configurable: true, value: requestFullscreen });
    const exitFullscreen = vi.fn(async () => undefined);

    await toggleElementFullscreen(player, null, exitFullscreen);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(exitFullscreen).not.toHaveBeenCalled();
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
});
