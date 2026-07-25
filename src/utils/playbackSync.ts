export type DriftAction = "none" | "rate" | "seek";

export interface DriftDecision {
  action: DriftAction;
  targetTimeSeconds: number;
  driftSeconds: number;
  temporaryRate: number;
}

export function calculateTargetTime(eventCurrentTime: number, sentAt: string, playbackRate: number, nowMs = Date.now()): number {
  const elapsed = Math.max(0, (nowMs - Date.parse(sentAt)) / 1000);
  return eventCurrentTime + elapsed * playbackRate;
}

export function calculateAuthoritativeTargetTime(input: {
  eventCurrentTime: number;
  sentAt: string;
  playbackRate: number;
  playbackStatus?: string;
  nowMs?: number;
}): number {
  if (input.playbackStatus !== "playing") return input.eventCurrentTime;
  return calculateTargetTime(input.eventCurrentTime, input.sentAt, input.playbackRate, input.nowMs);
}

export function decideDriftCorrection(input: {
  localTimeSeconds: number;
  targetTimeSeconds: number;
  hostPlaybackRate: number;
  buffering: boolean;
  canSetPlaybackRate: boolean;
  hostDragging: boolean;
}): DriftDecision {
  const driftSeconds = input.targetTimeSeconds - input.localTimeSeconds;
  const abs = Math.abs(driftSeconds);
  if (input.buffering || input.hostDragging || abs < 0.6) {
    return { action: "none", targetTimeSeconds: input.targetTimeSeconds, driftSeconds, temporaryRate: input.hostPlaybackRate };
  }
  if (abs <= 1.5 && input.canSetPlaybackRate) {
    const direction = driftSeconds > 0 ? 0.15 : -0.15;
    return { action: "rate", targetTimeSeconds: input.targetTimeSeconds, driftSeconds, temporaryRate: clampRate(input.hostPlaybackRate + direction) };
  }
  return { action: "seek", targetTimeSeconds: input.targetTimeSeconds, driftSeconds, temporaryRate: input.hostPlaybackRate };
}

export function shouldUseSnapshotFallback(snapshotUpdatedAt: string, lastEventAt: string | null): boolean {
  return !lastEventAt || Date.parse(snapshotUpdatedAt) > Date.parse(lastEventAt);
}

export function isBackwardHeartbeatUnsafe(input: {
  eventType: string;
  playbackStatus?: string;
  driftSeconds: number;
  sameStateVersion: boolean;
}): boolean {
  return input.eventType === "playback:heartbeat"
    && input.playbackStatus === "playing"
    && input.sameStateVersion
    && input.driftSeconds < -1.5;
}

export function createHeartbeatPayload(input: {
  videoId: string | null;
  driveFileId?: string | null;
  stateVersion: number;
  currentTimeSeconds: number;
  playbackRate: number;
  playbackStatus: "playing";
}) {
  return {
    type: "playback:heartbeat" as const,
    stateVersion: input.stateVersion,
    videoId: input.videoId,
    driveFileId: input.driveFileId ?? null,
    currentTimeSeconds: input.currentTimeSeconds,
    playbackRate: input.playbackRate,
    playbackStatus: input.playbackStatus
  };
}

function clampRate(rate: number): number {
  return Math.max(0.25, Math.min(2, Number(rate.toFixed(2))));
}
