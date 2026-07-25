import type { PlaybackEvent } from "../types/playback";

export type RemotePlayBlockReason = "player-not-ready" | "local-not-ready";

export interface QueuedRemotePlay {
  eventId: string;
  stateVersion: number;
  targetTimeSeconds: number;
  eventCurrentTimeSeconds: number;
  playbackRate: number;
  sentAt: string;
}

export function createQueuedRemotePlay(event: PlaybackEvent, targetTimeSeconds: number): QueuedRemotePlay | null {
  if (event.type !== "playback:play" || !event.playbackRate || event.currentTimeSeconds === undefined) return null;
  return {
    eventId: event.eventId,
    stateVersion: event.stateVersion,
    targetTimeSeconds,
    eventCurrentTimeSeconds: event.currentTimeSeconds,
    playbackRate: event.playbackRate,
    sentAt: event.sentAt
  };
}

export function getQueuedRemotePlayTarget(queued: QueuedRemotePlay, nowMs = Date.now()): number {
  const elapsedSeconds = Math.max(0, nowMs - Date.parse(queued.sentAt)) / 1000;
  return queued.eventCurrentTimeSeconds + elapsedSeconds * queued.playbackRate;
}

export function shouldReplaceQueuedPlay(current: QueuedRemotePlay | null, next: QueuedRemotePlay): boolean {
  return !current || next.stateVersion > current.stateVersion || (next.stateVersion === current.stateVersion && next.sentAt > current.sentAt);
}

export function remotePlayBlockReason(input: { playerReady: boolean; localReady: boolean }): RemotePlayBlockReason | null {
  if (!input.playerReady) return "player-not-ready";
  if (!input.localReady) return "local-not-ready";
  return null;
}

export function shouldShowResumeAction(state: { blocked: boolean; queuedPlay: QueuedRemotePlay | null }): boolean {
  return state.blocked && state.queuedPlay !== null;
}
