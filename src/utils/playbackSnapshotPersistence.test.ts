import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_CIRCUIT_BREAKER_MS,
  type SnapshotPersistenceState,
  createSnapshotPersistenceState,
  didExceedSafeSnapshotWriteRate,
  markSnapshotWriteFailed,
  markSnapshotWriteStarted,
  markSnapshotWriteSucceeded,
  shouldSkipSnapshotPersistence
} from "./playbackSnapshotPersistence";

describe("playback snapshot persistence guard", () => {
  it("skips guest, missing source, paused, in-flight, and circuit-open snapshots", () => {
    const state = createSnapshotPersistenceState();
    expect(shouldSkipSnapshotPersistence({ state, isHost: false, hasSource: true, isPlaying: true, nowMs: 0 })).toBe("not-host");
    expect(shouldSkipSnapshotPersistence({ state, isHost: true, hasSource: false, isPlaying: true, nowMs: 0 })).toBe("no-source");
    expect(shouldSkipSnapshotPersistence({ state, isHost: true, hasSource: true, isPlaying: false, nowMs: 0 })).toBe("not-playing");
    expect(shouldSkipSnapshotPersistence({ state: { ...state, inFlight: true }, isHost: true, hasSource: true, isPlaying: true, nowMs: 0 })).toBe("in-flight");
    expect(shouldSkipSnapshotPersistence({ state: { ...state, suspendedUntilMs: 10_000 }, isHost: true, hasSource: true, isPlaying: true, nowMs: 5_000 })).toBe("circuit-open");
  });

  it("allows one in-flight snapshot and clears the guard on success or failure", () => {
    const started = markSnapshotWriteStarted(createSnapshotPersistenceState(), 1_000);
    expect(started.inFlight).toBe(true);
    expect(markSnapshotWriteSucceeded(started).inFlight).toBe(false);
    expect(markSnapshotWriteFailed(started, 2_000).inFlight).toBe(false);
  });

  it("opens a temporary circuit breaker after repeated failures", () => {
    const first = markSnapshotWriteFailed(createSnapshotPersistenceState(), 1_000);
    const second = markSnapshotWriteFailed(first, 2_000);
    const third = markSnapshotWriteFailed(second, 3_000);
    expect(third.suspendedUntilMs).toBe(3_000 + SNAPSHOT_CIRCUIT_BREAKER_MS);
  });

  it("detects unsafe write volume in a 60 second window", () => {
    const state = createSnapshotPersistenceState();
    const withWrites = Array.from({ length: 11 }).reduce<SnapshotPersistenceState>((nextState, _, index) => markSnapshotWriteStarted(markSnapshotWriteSucceeded(nextState), index * 1_000), state);
    expect(didExceedSafeSnapshotWriteRate(withWrites, 11_000)).toBe(true);
    expect(didExceedSafeSnapshotWriteRate(withWrites, 70_000)).toBe(false);
  });
});
