import { describe, expect, it } from "vitest";
import type { PlaybackEvent } from "../types/playback";
import { isPlaybackEventAllowedOnChannel, parsePlaybackEvent, playbackChannelForEvent, shouldAcceptPlaybackEvent } from "./playbackEvents";

const event: PlaybackEvent = {
  type: "playback:play",
  roomId: "00000000-0000-4000-8000-000000000001",
  eventId: "00000000-0000-4000-8000-000000000002",
  senderUserId: "00000000-0000-4000-8000-000000000003",
  stateVersion: 3,
  sentAt: "2026-07-21T10:00:00.000Z",
  videoId: "dQw4w9WgXcQ",
  currentTimeSeconds: 10,
  playbackRate: 1,
  playbackStatus: "playing"
};

describe("playback events", () => {
  it("lets a friend accept valid host Play without granting echo permission", () => {
    expect(shouldAcceptPlaybackEvent(event, {
      seenEventIds: new Set(),
      latestStateVersion: 3,
      hostUserId: event.senderUserId,
      localUserId: "00000000-0000-4000-8000-000000000004"
    })).toBe(true);
  });

  it("rejects wrong-room and malformed events", () => {
    expect(parsePlaybackEvent(event, event.roomId)?.type).toBe("playback:play");
    expect(parsePlaybackEvent(event, "00000000-0000-4000-8000-000000000099")).toBeNull();
    expect(parsePlaybackEvent({ ...event, videoId: "bad" }, event.roomId)).toBeNull();
  });

  it("rejects duplicate, stale, echo, and unauthorized host commands", () => {
    expect(shouldAcceptPlaybackEvent(event, { seenEventIds: new Set(), latestStateVersion: 3, hostUserId: event.senderUserId, localUserId: "00000000-0000-4000-8000-000000000004" })).toBe(true);
    expect(shouldAcceptPlaybackEvent(event, { seenEventIds: new Set([event.eventId]), latestStateVersion: 3, hostUserId: event.senderUserId, localUserId: "00000000-0000-4000-8000-000000000004" })).toBe(false);
    expect(shouldAcceptPlaybackEvent(event, { seenEventIds: new Set(), latestStateVersion: 4, hostUserId: event.senderUserId, localUserId: "00000000-0000-4000-8000-000000000004" })).toBe(false);
    expect(shouldAcceptPlaybackEvent(event, { seenEventIds: new Set(), latestStateVersion: 3, hostUserId: event.senderUserId, localUserId: event.senderUserId })).toBe(false);
    expect(shouldAcceptPlaybackEvent(event, { seenEventIds: new Set(), latestStateVersion: 3, hostUserId: "00000000-0000-4000-8000-000000000004", localUserId: "00000000-0000-4000-8000-000000000005" })).toBe(false);
  });

  it("rejects same-version older sentAt but accepts newer heartbeat", () => {
    const context = {
      seenEventIds: new Set<string>(),
      latestStateVersion: 3,
      latestEventSentAt: "2026-07-21T10:00:02.000Z",
      hostUserId: event.senderUserId,
      localUserId: "00000000-0000-4000-8000-000000000004"
    };
    expect(shouldAcceptPlaybackEvent({ ...event, eventId: "00000000-0000-4000-8000-000000000008", sentAt: "2026-07-21T10:00:01.000Z" }, context)).toBe(false);
    expect(shouldAcceptPlaybackEvent({ ...event, type: "playback:heartbeat", eventId: "00000000-0000-4000-8000-000000000009", sentAt: "2026-07-21T10:00:03.000Z" }, context)).toBe(true);
  });

  it("keeps valid pause and seek commands accepted from the host", () => {
    const context = { seenEventIds: new Set<string>(), latestStateVersion: 3, hostUserId: event.senderUserId, localUserId: "00000000-0000-4000-8000-000000000004" };
    expect(shouldAcceptPlaybackEvent({ ...event, type: "playback:pause", eventId: "00000000-0000-4000-8000-000000000006" }, context)).toBe(true);
    expect(shouldAcceptPlaybackEvent({ ...event, type: "playback:seek", eventId: "00000000-0000-4000-8000-000000000007" }, context)).toBe(true);
  });

  it("separates host-authoritative traffic from member participant traffic", () => {
    expect(playbackChannelForEvent("playback:play")).toBe("authoritative");
    expect(playbackChannelForEvent("playback:heartbeat")).toBe("authoritative");
    expect(playbackChannelForEvent("participant:ready")).toBe("participant");
    expect(playbackChannelForEvent("playback:sync-request")).toBe("participant");
    expect(isPlaybackEventAllowedOnChannel("playback:play", "participant")).toBe(false);
    expect(isPlaybackEventAllowedOnChannel("participant:ready", "authoritative")).toBe(false);
  });

  it("allows a guest sync request without granting authoritative command permission", () => {
    const guestId = "00000000-0000-4000-8000-000000000004";
    const hostId = event.senderUserId;
    const syncRequest = {
      ...event,
      type: "playback:sync-request" as const,
      eventId: "00000000-0000-4000-8000-000000000011",
      senderUserId: guestId
    };
    expect(shouldAcceptPlaybackEvent(syncRequest, {
      seenEventIds: new Set(),
      latestStateVersion: 3,
      hostUserId: hostId,
      localUserId: hostId
    })).toBe(true);
    expect(shouldAcceptPlaybackEvent({ ...syncRequest, type: "playback:seek" }, {
      seenEventIds: new Set(),
      latestStateVersion: 3,
      hostUserId: hostId,
      localUserId: "00000000-0000-4000-8000-000000000005"
    })).toBe(false);
  });

  it("parses Drive source and heartbeat events without requiring a YouTube id", () => {
    const driveEvent: PlaybackEvent = {
      ...event,
      type: "source:set",
      eventId: "00000000-0000-4000-8000-000000000010",
      sourceType: "google_drive",
      videoId: null,
      driveFileId: "Drive_File-1234567890"
    };
    expect(parsePlaybackEvent(driveEvent, event.roomId)).toMatchObject({ sourceType: "google_drive", driveFileId: "Drive_File-1234567890" });
    expect(parsePlaybackEvent({ ...driveEvent, driveFileId: "bad/path" }, event.roomId)).toBeNull();
  });
});
