import { describe, expect, it } from "vitest";
import { formatPlaybackDuration, formatPlaybackTime, normalizePlaybackTime } from "./playbackDisplay";

describe("playback display utilities", () => {
  it("formats current time and duration without exposing invalid numbers", () => {
    expect(formatPlaybackTime(204)).toBe("03:24");
    expect(formatPlaybackDuration(2530)).toBe("42:10");
    expect(formatPlaybackTime(Number.NaN)).toBe("00:00");
    expect(formatPlaybackDuration(Number.POSITIVE_INFINITY)).toBe("--:--");
    expect(formatPlaybackDuration(0)).toBe("--:--");
  });

  it("calculates bounded read-only progress", () => {
    expect(normalizePlaybackTime(25, 100)).toEqual({ currentTimeSeconds: 25, durationSeconds: 100, progressPercent: 25 });
    expect(normalizePlaybackTime(120, 100)).toEqual({ currentTimeSeconds: 100, durationSeconds: 100, progressPercent: 100 });
    expect(normalizePlaybackTime(Number.NaN, null)).toEqual({ currentTimeSeconds: 0, durationSeconds: null, progressPercent: 0 });
  });
});
