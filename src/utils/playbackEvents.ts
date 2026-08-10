import type { PlaybackEvent, PlaybackEventType } from "../types/playback";
import { playbackEventSchema } from "../types/playback";

export type PlaybackChannelKind = "authoritative" | "participant";

const AUTHORITATIVE_EVENT_TYPES = new Set<PlaybackEventType>([
  "source:set",
  "playback:play",
  "playback:pause",
  "playback:seek",
  "playback:rate",
  "playback:heartbeat",
  "playback:sync-state",
  "playback:error"
]);

export function parsePlaybackEvent(input: unknown, roomId: string): PlaybackEvent | null {
  const parsed = playbackEventSchema.safeParse(input);
  if (!parsed.success) return null;
  if (parsed.data.roomId !== roomId) return null;
  return parsed.data;
}

export function shouldAcceptPlaybackEvent(
  event: PlaybackEvent,
  context: { seenEventIds: ReadonlySet<string>; latestStateVersion: number; hostUserId: string; localUserId: string; latestEventSentAt?: string | null }
): boolean {
  return getPlaybackEventRejectionReason(event, context) === null;
}

export function getPlaybackEventRejectionReason(
  event: PlaybackEvent,
  context: { seenEventIds: ReadonlySet<string>; latestStateVersion: number; hostUserId: string; localUserId: string; latestEventSentAt?: string | null }
): "echo" | "duplicate" | "stale-version" | "stale-sent-at" | "non-host-command" | null {
  if (event.senderUserId === context.localUserId) return "echo";
  if (context.seenEventIds.has(event.eventId)) return "duplicate";
  if (isAuthoritativePlaybackEvent(event.type)) {
    if (event.stateVersion < context.latestStateVersion) return "stale-version";
    if (event.stateVersion === context.latestStateVersion && context.latestEventSentAt && Date.parse(event.sentAt) <= Date.parse(context.latestEventSentAt)) {
      return "stale-sent-at";
    }
    if (event.senderUserId !== context.hostUserId) return "non-host-command";
  }
  return null;
}

export function isAuthoritativePlaybackEvent(type: PlaybackEventType): boolean {
  return AUTHORITATIVE_EVENT_TYPES.has(type);
}

export function playbackChannelForEvent(type: PlaybackEventType): PlaybackChannelKind {
  return isAuthoritativePlaybackEvent(type) ? "authoritative" : "participant";
}

export function isPlaybackEventAllowedOnChannel(type: PlaybackEventType, channel: PlaybackChannelKind): boolean {
  return playbackChannelForEvent(type) === channel;
}

export function createPlaybackEvent(input: Omit<PlaybackEvent, "eventId" | "sentAt">): PlaybackEvent {
  return { ...input, eventId: crypto.randomUUID(), sentAt: new Date().toISOString() };
}
