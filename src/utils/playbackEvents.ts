import type { PlaybackEvent } from "../types/playback";
import { playbackEventSchema } from "../types/playback";

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
  if (event.stateVersion < context.latestStateVersion) return "stale-version";
  if (event.stateVersion === context.latestStateVersion && context.latestEventSentAt && Date.parse(event.sentAt) <= Date.parse(context.latestEventSentAt)) {
    return "stale-sent-at";
  }
  const hostOnly = event.type.startsWith("playback:") || event.type === "source:set";
  if (hostOnly && event.senderUserId !== context.hostUserId) return "non-host-command";
  return null;
}

export function createPlaybackEvent(input: Omit<PlaybackEvent, "eventId" | "sentAt">): PlaybackEvent {
  return { ...input, eventId: crypto.randomUUID(), sentAt: new Date().toISOString() };
}
