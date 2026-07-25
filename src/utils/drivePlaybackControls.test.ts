import { describe, expect, it } from "vitest";
import { getDriveSurfaceAction, isAutoplayPolicyError } from "./drivePlaybackControls";

describe("Drive video surface controls", () => {
  it("maps a host video tap to authoritative play or pause", () => {
    expect(getDriveSurfaceAction({ isHost: true, isPlaying: false, playbackUnlocked: false, autoplayBlocked: false })).toBe("host-play");
    expect(getDriveSurfaceAction({ isHost: true, isPlaying: true, playbackUnlocked: true, autoplayBlocked: false })).toBe("host-pause");
  });

  it("uses a guest tap only for local playback unlock", () => {
    expect(getDriveSurfaceAction({ isHost: false, isPlaying: false, playbackUnlocked: false, autoplayBlocked: false })).toBe("guest-unlock");
    expect(getDriveSurfaceAction({ isHost: false, isPlaying: true, playbackUnlocked: true, autoplayBlocked: true })).toBe("guest-unlock");
    expect(getDriveSurfaceAction({ isHost: false, isPlaying: true, playbackUnlocked: true, autoplayBlocked: false })).toBe("guest-controlled");
  });

  it("recognizes browser autoplay rejection", () => {
    expect(isAutoplayPolicyError(new DOMException("blocked", "NotAllowedError"))).toBe(true);
    expect(isAutoplayPolicyError(new Error("network"))).toBe(false);
  });
});
