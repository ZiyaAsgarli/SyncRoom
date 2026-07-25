import type { RoomMediaSource } from "../types/mediaSource";

export type DriveMediaLifecyclePhase =
  | "IDLE"
  | "AUTHORIZING"
  | "AUTHORIZED"
  | "SW_WAITING"
  | "BINDING"
  | "BOUND"
  | "MEDIA_LOADING"
  | "MEDIA_READY"
  | "PLAYABLE"
  | "RENEWING_TOKEN"
  | "REBINDING"
  | "RECOVERING"
  | "AUTH_REQUIRED"
  | "ACCESS_DENIED"
  | "FATAL_MEDIA_ERROR";

export type DriveMediaErrorCode =
  | "DRIVE_SESSION_NOT_BOUND"
  | "DRIVE_AUTH_REQUIRED"
  | "DRIVE_ACCESS_DENIED"
  | "DRIVE_RANGE_ERROR"
  | "DRIVE_NETWORK_ERROR"
  | "DRIVE_MEDIA_FORMAT_ERROR"
  | "DRIVE_UNKNOWN_MEDIA_ERROR";

export type DriveMediaSource = Extract<RoomMediaSource, { type: "google_drive" }>;

export interface DriveMediaLifecycleState {
  phase: DriveMediaLifecyclePhase;
  generation: number;
  sourceIdentity: string | null;
  mediaSrc: string | null;
  errorCode: DriveMediaErrorCode | null;
  recoveryAttempts: number;
}

let mediaGenerationSequence = 0;

export function nextDriveMediaGeneration(): number {
  mediaGenerationSequence += 1;
  return mediaGenerationSequence;
}

export function createDriveMediaLifecycleState(): DriveMediaLifecycleState {
  return { phase: "IDLE", generation: 0, sourceIdentity: null, mediaSrc: null, errorCode: null, recoveryAttempts: 0 };
}

export function driveSourceIdentity(source: DriveMediaSource | null): string | null {
  if (!source) return null;
  return [source.fileId, source.mimeType, source.size ?? "unknown", source.modifiedTime ?? "unknown"].join(":");
}

export function nextDriveGeneration(state: DriveMediaLifecycleState, source: DriveMediaSource | null): DriveMediaLifecycleState {
  const sourceIdentity = driveSourceIdentity(source);
  if (sourceIdentity === state.sourceIdentity) return state;
  return {
    phase: source ? "AUTHORIZED" : "IDLE",
    generation: nextDriveMediaGeneration(),
    sourceIdentity,
    mediaSrc: null,
    errorCode: null,
    recoveryAttempts: 0
  };
}

export function transitionDriveLifecycle(
  state: DriveMediaLifecycleState,
  generation: number,
  update: Partial<Omit<DriveMediaLifecycleState, "generation" | "sourceIdentity">>
): DriveMediaLifecycleState {
  if (generation !== state.generation) return state;
  return { ...state, ...update };
}

export function classifyDriveMediaError(input: { gatewayCode?: string | null; mediaErrorCode?: number | null }): DriveMediaErrorCode {
  const knownCodes: DriveMediaErrorCode[] = [
    "DRIVE_SESSION_NOT_BOUND",
    "DRIVE_AUTH_REQUIRED",
    "DRIVE_ACCESS_DENIED",
    "DRIVE_RANGE_ERROR",
    "DRIVE_NETWORK_ERROR",
    "DRIVE_MEDIA_FORMAT_ERROR",
    "DRIVE_UNKNOWN_MEDIA_ERROR"
  ];
  if (input.gatewayCode && knownCodes.includes(input.gatewayCode as DriveMediaErrorCode)) return input.gatewayCode as DriveMediaErrorCode;
  if (input.mediaErrorCode === 4) return "DRIVE_MEDIA_FORMAT_ERROR";
  if (input.mediaErrorCode === 2) return "DRIVE_NETWORK_ERROR";
  return "DRIVE_UNKNOWN_MEDIA_ERROR";
}

export function driveMediaErrorMessage(code: DriveMediaErrorCode): string {
  if (code === "DRIVE_AUTH_REQUIRED") return "Google Drive authorization is required.";
  if (code === "DRIVE_ACCESS_DENIED") return "This Drive video is not available to your Google account.";
  if (code === "DRIVE_RANGE_ERROR") return "Drive could not serve the requested video range.";
  if (code === "DRIVE_NETWORK_ERROR") return "Drive streaming was interrupted.";
  if (code === "DRIVE_MEDIA_FORMAT_ERROR") return "This video format is not supported by the browser.";
  if (code === "DRIVE_SESSION_NOT_BOUND") return "The private Drive media session was interrupted.";
  return "Drive video playback could not be restored.";
}

export function canAutomaticallyRecoverDriveMedia(code: DriveMediaErrorCode): boolean {
  return code === "DRIVE_SESSION_NOT_BOUND" || code === "DRIVE_NETWORK_ERROR" || code === "DRIVE_RANGE_ERROR" || code === "DRIVE_UNKNOWN_MEDIA_ERROR";
}
