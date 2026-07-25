import { useEffect, useMemo, useRef, useState } from "react";
import type { DriveAuthSnapshot } from "../services/driveAuth";
import { getUsableDriveAccessToken, requestDriveAccessToken } from "../services/driveAuth";
import { driveSourceIdentity, type DriveMediaSource } from "../utils/driveMediaLifecycle";

export type DriveBootstrapState = "idle" | "attempting_silent_restore" | "restored" | "interaction_required";

export function shouldShowDriveConnect(bootstrapState: DriveBootstrapState, reconnectRequired: boolean): boolean {
  return bootstrapState === "interaction_required" || reconnectRequired;
}

export function useDriveSilentBootstrap(source: DriveMediaSource | null, loginHint: string, auth: DriveAuthSnapshot): DriveBootstrapState {
  const [state, setState] = useState<DriveBootstrapState>("idle");
  const sourceIdentity = useMemo(() => driveSourceIdentity(source), [source]);
  const normalizedLoginHint = loginHint.trim().toLowerCase();
  const attemptKey = sourceIdentity && normalizedLoginHint ? `${sourceIdentity}:${normalizedLoginHint}` : null;
  const activeAttemptKeyRef = useRef(attemptKey);
  activeAttemptKeyRef.current = attemptKey;

  useEffect(() => {
    if (!attemptKey) {
      setState("idle");
      return;
    }
    if (getUsableDriveAccessToken()) {
      setState("restored");
      return;
    }
    if (auth.reconnectRequired) {
      setState("interaction_required");
      return;
    }

    setState("attempting_silent_restore");
    void requestDriveAccessToken({
      silent: true,
      forceRefresh: true,
      loginHint: normalizedLoginHint
    }).then(() => {
      if (activeAttemptKeyRef.current === attemptKey) setState("restored");
    }).catch(() => {
      if (activeAttemptKeyRef.current === attemptKey) setState("interaction_required");
    });
  }, [attemptKey, auth.expiresAt, auth.reconnectRequired, normalizedLoginHint]);

  return state;
}
