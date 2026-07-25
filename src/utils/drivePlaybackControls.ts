export type DriveSurfaceAction = "host-play" | "host-pause" | "guest-unlock" | "guest-controlled";

export function getDriveSurfaceAction(input: {
  isHost: boolean;
  isPlaying: boolean;
  playbackUnlocked: boolean;
  autoplayBlocked: boolean;
}): DriveSurfaceAction {
  if (input.isHost) return input.isPlaying ? "host-pause" : "host-play";
  if (!input.playbackUnlocked || input.autoplayBlocked) return "guest-unlock";
  return "guest-controlled";
}

export function isAutoplayPolicyError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}
