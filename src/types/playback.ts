import { z } from "zod";
import type { PlaybackStatus, SourceType } from "./database";

export const PLAYBACK_EVENT_TYPES = [
  "source:set",
  "player:ready",
  "participant:ready",
  "playback:play",
  "playback:pause",
  "playback:seek",
  "playback:rate",
  "playback:heartbeat",
  "playback:sync-request",
  "playback:sync-state",
  "participant:buffering",
  "participant:recovered",
  "playback:error"
] as const;

export type PlaybackEventType = typeof PLAYBACK_EVENT_TYPES[number];

export const playbackEventSchema = z.object({
  type: z.enum(PLAYBACK_EVENT_TYPES),
  roomId: z.string().uuid(),
  eventId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  stateVersion: z.number().int().nonnegative(),
  sentAt: z.string().datetime(),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).nullable().optional(),
  currentTimeSeconds: z.number().nonnegative().optional(),
  playbackRate: z.number().min(0.25).max(2).optional(),
  playbackStatus: z.enum(["idle", "loading", "cued", "playing", "paused", "buffering", "ended", "error"]).optional(),
  sourceType: z.enum(["youtube", "google_drive"]).optional(),
  driveFileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/).nullable().optional(),
  errorMessage: z.string().max(200).optional()
});

export type PlaybackEvent = z.infer<typeof playbackEventSchema> & { playbackStatus?: PlaybackStatus; sourceType?: SourceType };
