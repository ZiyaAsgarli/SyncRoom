import { describe, expect, it, vi } from "vitest";
import { calculateAuthoritativeTargetTime, calculateRelativeSeekTarget, calculateTargetTime, createHeartbeatPayload, decideDriftCorrection, isBackwardHeartbeatUnsafe, issueRelativeAuthoritativeSeek, shouldUseSnapshotFallback } from "./playbackSync";

describe("playback synchronization utilities", () => {
  it("calculates target time from network elapsed time", () => {
    expect(calculateTargetTime(10, "2026-07-21T10:00:00.000Z", 1.5, Date.parse("2026-07-21T10:00:02.000Z"))).toBe(13);
  });

  it("calculates target time while playing but not while paused", () => {
    const now = Date.parse("2026-07-21T10:00:02.000Z");
    expect(calculateAuthoritativeTargetTime({ eventCurrentTime: 10, sentAt: "2026-07-21T10:00:00.000Z", playbackRate: 1, playbackStatus: "playing", nowMs: now })).toBe(12);
    expect(calculateAuthoritativeTargetTime({ eventCurrentTime: 10, sentAt: "2026-07-21T10:00:00.000Z", playbackRate: 1, playbackStatus: "paused", nowMs: now })).toBe(10);
  });

  it("clamps relative rewind and forward targets to media bounds", () => {
    expect(calculateRelativeSeekTarget(6, 120, -10)).toBe(0);
    expect(calculateRelativeSeekTarget(40, 120, -10)).toBe(30);
    expect(calculateRelativeSeekTarget(40, 120, 10)).toBe(50);
    expect(calculateRelativeSeekTarget(115, 120, 10)).toBe(120);
  });

  it("dispatches exactly one adapter-agnostic authoritative seek for a host", () => {
    const commitSeek = vi.fn();
    expect(issueRelativeAuthoritativeSeek({ isHost: true, currentTimeSeconds: 40, durationSeconds: 120, offsetSeconds: -10, commitSeek })).toBe(true);
    expect(commitSeek).toHaveBeenCalledOnce();
    expect(commitSeek).toHaveBeenCalledWith(30);
  });

  it("never dispatches a relative seek for a guest", () => {
    const commitSeek = vi.fn();
    expect(issueRelativeAuthoritativeSeek({ isHost: false, currentTimeSeconds: 40, durationSeconds: 120, offsetSeconds: 10, commitSeek })).toBe(false);
    expect(commitSeek).not.toHaveBeenCalled();
  });

  it("applies drift thresholds", () => {
    expect(decideDriftCorrection({ localTimeSeconds: 10, targetTimeSeconds: 10.4, hostPlaybackRate: 1, buffering: false, canSetPlaybackRate: true, hostDragging: false }).action).toBe("none");
    expect(decideDriftCorrection({ localTimeSeconds: 10, targetTimeSeconds: 11, hostPlaybackRate: 1, buffering: false, canSetPlaybackRate: true, hostDragging: false }).action).toBe("rate");
    expect(decideDriftCorrection({ localTimeSeconds: 10, targetTimeSeconds: 12, hostPlaybackRate: 1, buffering: false, canSetPlaybackRate: true, hostDragging: false }).action).toBe("seek");
  });

  it("falls back to seek when temporary rate correction is unavailable", () => {
    expect(decideDriftCorrection({ localTimeSeconds: 10, targetTimeSeconds: 11, hostPlaybackRate: 1, buffering: false, canSetPlaybackRate: false, hostDragging: false }).action).toBe("seek");
  });

  it("does not correct while buffering", () => {
    expect(decideDriftCorrection({ localTimeSeconds: 10, targetTimeSeconds: 12, hostPlaybackRate: 1, buffering: true, canSetPlaybackRate: true, hostDragging: false }).action).toBe("none");
  });

  it("chooses snapshot fallback only when fresher", () => {
    expect(shouldUseSnapshotFallback("2026-07-21T10:00:02.000Z", "2026-07-21T10:00:01.000Z")).toBe(true);
    expect(shouldUseSnapshotFallback("2026-07-21T10:00:00.000Z", "2026-07-21T10:00:01.000Z")).toBe(false);
  });

  it("creates heartbeat payloads from fresh player time", () => {
    const first = createHeartbeatPayload({ videoId: "dQw4w9WgXcQ", stateVersion: 4, currentTimeSeconds: 7.3, playbackRate: 1, playbackStatus: "playing" });
    const second = createHeartbeatPayload({ videoId: "dQw4w9WgXcQ", stateVersion: 4, currentTimeSeconds: 12.4, playbackRate: 1, playbackStatus: "playing" });
    expect(second.currentTimeSeconds).toBeGreaterThan(first.currentTimeSeconds);
  });

  it("flags stale backward heartbeats without blocking explicit seeks", () => {
    expect(isBackwardHeartbeatUnsafe({ eventType: "playback:heartbeat", playbackStatus: "playing", driftSeconds: -5, sameStateVersion: true })).toBe(true);
    expect(isBackwardHeartbeatUnsafe({ eventType: "playback:seek", playbackStatus: "playing", driftSeconds: -5, sameStateVersion: false })).toBe(false);
  });
});
