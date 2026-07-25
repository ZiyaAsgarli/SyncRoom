import { describe, expect, it } from "vitest";
import type { PlaybackEvent } from "../types/playback";
import { createQueuedRemotePlay, getQueuedRemotePlayTarget, remotePlayBlockReason, shouldReplaceQueuedPlay, shouldShowResumeAction } from "./remotePlay";

const playEvent: PlaybackEvent = {
  type: "playback:play",
  roomId: "00000000-0000-4000-8000-000000000001",
  eventId: "00000000-0000-4000-8000-000000000002",
  senderUserId: "00000000-0000-4000-8000-000000000003",
  stateVersion: 5,
  sentAt: "2026-07-21T10:00:00.000Z",
  currentTimeSeconds: 12,
  playbackRate: 1,
  playbackStatus: "playing"
};

describe("remote play queue", () => {
  it("creates queued host play commands with target time", () => {
    expect(createQueuedRemotePlay(playEvent, 13)).toMatchObject({ eventId: playEvent.eventId, targetTimeSeconds: 13 });
  });

  it("keeps the newest state version", () => {
    const current = createQueuedRemotePlay(playEvent, 13);
    const stale = createQueuedRemotePlay({ ...playEvent, eventId: "00000000-0000-4000-8000-000000000004", stateVersion: 4 }, 14);
    const newer = createQueuedRemotePlay({ ...playEvent, eventId: "00000000-0000-4000-8000-000000000005", stateVersion: 6 }, 15);
    expect(current && stale && shouldReplaceQueuedPlay(current, stale)).toBe(false);
    expect(current && newer && shouldReplaceQueuedPlay(current, newer)).toBe(true);
  });

  it("queues before player readiness or local readiness", () => {
    expect(remotePlayBlockReason({ playerReady: false, localReady: true })).toBe("player-not-ready");
    expect(remotePlayBlockReason({ playerReady: true, localReady: false })).toBe("local-not-ready");
    expect(remotePlayBlockReason({ playerReady: true, localReady: true })).toBeNull();
  });

  it("queued Play executes after readiness prerequisites are satisfied", () => {
    const queued = createQueuedRemotePlay(playEvent, 13);
    expect(remotePlayBlockReason({ playerReady: false, localReady: false })).toBe("player-not-ready");
    expect(remotePlayBlockReason({ playerReady: true, localReady: false })).toBe("local-not-ready");
    expect(remotePlayBlockReason({ playerReady: true, localReady: true })).toBeNull();
    expect(queued?.targetTimeSeconds).toBe(13);
  });

  it("resumes a delayed queued Play at the latest authoritative target", () => {
    const queued = createQueuedRemotePlay(playEvent, 13);
    expect(queued && getQueuedRemotePlayTarget(queued, Date.parse(playEvent.sentAt) + 5_000)).toBe(17);
  });

  it("shows resume action only for blocked queued play", () => {
    const queued = createQueuedRemotePlay(playEvent, 13);
    expect(shouldShowResumeAction({ blocked: true, queuedPlay: queued })).toBe(true);
    expect(shouldShowResumeAction({ blocked: true, queuedPlay: null })).toBe(false);
  });
});
