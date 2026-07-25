import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DriveAuthSnapshot } from "../services/driveAuth";
import { getUsableDriveAccessToken } from "../services/driveAuth";
import { bindDriveMediaSession, clearDriveMediaSession, driveMediaUrl } from "../services/driveServiceWorker";
import {
  canAutomaticallyRecoverDriveMedia,
  classifyDriveMediaError,
  createDriveMediaLifecycleState,
  driveMediaErrorMessage,
  driveSourceIdentity,
  nextDriveGeneration,
  transitionDriveLifecycle,
  type DriveMediaErrorCode,
  type DriveMediaLifecyclePhase,
  type DriveMediaLifecycleState,
  type DriveMediaSource
} from "../utils/driveMediaLifecycle";

const AUTO_RECOVERY_LIMIT = 1;
const TOTAL_RECOVERY_LIMIT = 2;
const GATEWAY_ERROR_HEADER = "X-SyncRoom-Drive-Error";

export interface DriveElementError {
  mediaErrorCode: number | null;
}

export function useDriveMediaLifecycle(source: DriveMediaSource | null, auth: DriveAuthSnapshot) {
  const [state, setState] = useState<DriveMediaLifecycleState>(createDriveMediaLifecycleState);
  const stateRef = useRef(state);
  const sourceRef = useRef(source);
  const bindOperationRef = useRef<{ generation: number; tokenExpiresAt: number | null; promise: Promise<boolean> } | null>(null);
  const recoveryOperationRef = useRef<Promise<{ recovered: boolean; code: DriveMediaErrorCode }> | null>(null);
  const teardownTimerRef = useRef<number | null>(null);
  const sourceIdentity = useMemo(() => driveSourceIdentity(source), [source]);
  sourceRef.current = source;

  const commitState = useCallback((next: DriveMediaLifecycleState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const patchCurrentGeneration = useCallback((generation: number, update: Partial<Omit<DriveMediaLifecycleState, "generation" | "sourceIdentity">>) => {
    const next = transitionDriveLifecycle(stateRef.current, generation, update);
    if (next === stateRef.current) {
      logDriveLifecycle(generation, sourceRef.current?.fileId ?? null, "stale-operation-ignored", "generation-mismatch");
      return false;
    }
    commitState(next);
    return true;
  }, [commitState]);

  const ensureBound = useCallback(async (generation: number, activeSource: DriveMediaSource, reason: string, force = false): Promise<boolean> => {
    if (generation !== stateRef.current.generation) return false;
    const accessToken = getUsableDriveAccessToken();
    if (!accessToken) {
      patchCurrentGeneration(generation, { phase: "AUTH_REQUIRED", errorCode: "DRIVE_AUTH_REQUIRED" });
      return false;
    }
    if (activeSource.size === null) {
      patchCurrentGeneration(generation, { phase: "FATAL_MEDIA_ERROR", errorCode: "DRIVE_UNKNOWN_MEDIA_ERROR" });
      return false;
    }
    const rebind = stateRef.current.mediaSrc !== null;
    patchCurrentGeneration(generation, { phase: rebind ? "REBINDING" : "SW_WAITING", errorCode: null });
    logDriveLifecycle(generation, activeSource.fileId, rebind ? "rebind-start" : "bind-start", reason);
    try {
      patchCurrentGeneration(generation, { phase: rebind ? "REBINDING" : "BINDING" });
      const binding = await bindDriveMediaSession(generation, activeSource.fileId, accessToken, {
        mimeType: activeSource.mimeType,
        fileSizeBytes: activeSource.size
      }, force);
      if (binding.generation !== generation || generation !== stateRef.current.generation) {
        logDriveLifecycle(generation, activeSource.fileId, "stale-operation-ignored", "bind-ack");
        return false;
      }
      const mediaSrc = stateRef.current.mediaSrc ?? driveMediaUrl(activeSource.fileId, generation);
      patchCurrentGeneration(generation, { phase: "BOUND", mediaSrc, errorCode: null });
      logDriveLifecycle(generation, activeSource.fileId, rebind ? "rebind-ack" : "bind-ack", reason);
      return true;
    } catch {
      if (generation === stateRef.current.generation) {
        patchCurrentGeneration(generation, { phase: "RECOVERING", errorCode: "DRIVE_SESSION_NOT_BOUND" });
      }
      return false;
    }
  }, [patchCurrentGeneration]);

  const ensureInitiallyBound = useCallback(async (generation: number, activeSource: DriveMediaSource, reason: string): Promise<boolean> => {
    if (await ensureBound(generation, activeSource, reason)) return true;
    const current = stateRef.current;
    if (
      current.generation !== generation ||
      current.phase !== "RECOVERING" ||
      current.recoveryAttempts >= AUTO_RECOVERY_LIMIT ||
      !getUsableDriveAccessToken()
    ) {
      return false;
    }
    patchCurrentGeneration(generation, { recoveryAttempts: current.recoveryAttempts + 1 });
    logDriveLifecycle(generation, activeSource.fileId, "rebind-start", "initial-bind-recovery");
    return ensureBound(generation, activeSource, "initial-bind-recovery", true);
  }, [ensureBound, patchCurrentGeneration]);

  useEffect(() => {
    const currentSource = sourceRef.current;
    const previous = stateRef.current;
    const next = nextDriveGeneration(previous, currentSource);
    if (next !== previous) {
      commitState(next);
      if (!currentSource && previous.generation > 0) void clearDriveMediaSession(previous.generation).catch(() => undefined);
    }
    if (!currentSource) return;
    const generation = stateRef.current.generation;
    if (auth.reconnectRequired && !getUsableDriveAccessToken()) {
      patchCurrentGeneration(generation, { phase: "AUTH_REQUIRED", errorCode: "DRIVE_AUTH_REQUIRED" });
      return;
    }
    const existingBind = bindOperationRef.current;
    if (!existingBind || existingBind.generation !== generation) {
      const reason = next !== previous ? "source-active" : auth.expiresAt !== null ? "token-state" : "source-stable";
      const promise = ensureInitiallyBound(generation, currentSource, reason).finally(() => {
        if (bindOperationRef.current?.promise === promise) bindOperationRef.current = null;
      });
      bindOperationRef.current = { generation, tokenExpiresAt: auth.expiresAt, promise };
    } else if (existingBind.tokenExpiresAt !== auth.expiresAt) {
      const promise = existingBind.promise
        .then(() => ensureBound(generation, currentSource, "token-replaced"))
        .finally(() => {
          if (bindOperationRef.current?.promise === promise) bindOperationRef.current = null;
        });
      bindOperationRef.current = { generation, tokenExpiresAt: auth.expiresAt, promise };
    }
  }, [auth.expiresAt, auth.reconnectRequired, commitState, ensureBound, ensureInitiallyBound, patchCurrentGeneration, sourceIdentity]);

  useEffect(() => {
    if (teardownTimerRef.current !== null) {
      window.clearTimeout(teardownTimerRef.current);
      teardownTimerRef.current = null;
    }
    return () => {
      const expectedGeneration = stateRef.current.generation;
      teardownTimerRef.current = window.setTimeout(() => {
        void clearDriveMediaSession(expectedGeneration).catch(() => undefined);
      }, 0);
    };
  }, []);

  const markMediaState = useCallback((phase: Extract<DriveMediaLifecyclePhase, "MEDIA_LOADING" | "MEDIA_READY" | "PLAYABLE">) => {
    const current = stateRef.current;
    patchCurrentGeneration(current.generation, {
      phase,
      errorCode: null,
      recoveryAttempts: phase === "PLAYABLE" ? 0 : current.recoveryAttempts
    });
    logDriveLifecycle(current.generation, sourceRef.current?.fileId ?? null, phase.toLowerCase().replace("_", "-"), "media-event");
  }, [patchCurrentGeneration]);

  const recover = useCallback(async (elementError: DriveElementError, manual = false): Promise<{ recovered: boolean; code: DriveMediaErrorCode }> => {
    if (recoveryOperationRef.current) return recoveryOperationRef.current;
    const operation: Promise<{ recovered: boolean; code: DriveMediaErrorCode }> = (async (): Promise<{ recovered: boolean; code: DriveMediaErrorCode }> => {
      const current = stateRef.current;
      const activeSource = sourceRef.current;
      if (!activeSource) return { recovered: false, code: "DRIVE_UNKNOWN_MEDIA_ERROR" as const };
      const gatewayCode = await probeGatewayError(current.mediaSrc);
      const code = classifyDriveMediaError({ gatewayCode, mediaErrorCode: elementError.mediaErrorCode });
      const limit = manual ? TOTAL_RECOVERY_LIMIT : AUTO_RECOVERY_LIMIT;
      if (!canAutomaticallyRecoverDriveMedia(code) || current.recoveryAttempts >= limit) {
        const phase = code === "DRIVE_AUTH_REQUIRED" ? "AUTH_REQUIRED" : code === "DRIVE_ACCESS_DENIED" ? "ACCESS_DENIED" : "FATAL_MEDIA_ERROR";
        patchCurrentGeneration(current.generation, { phase, errorCode: code });
        return { recovered: false, code };
      }
      if (!getUsableDriveAccessToken()) {
        patchCurrentGeneration(current.generation, { phase: "AUTH_REQUIRED", errorCode: "DRIVE_AUTH_REQUIRED" });
        return { recovered: false, code: "DRIVE_AUTH_REQUIRED" };
      }
      patchCurrentGeneration(current.generation, {
        phase: "RECOVERING",
        errorCode: null,
        recoveryAttempts: current.recoveryAttempts + 1
      });
      logDriveLifecycle(current.generation, activeSource.fileId, "media-recovery-start", code);
      const recovered = await ensureBound(current.generation, activeSource, "media-recovery", true);
      if (recovered) logDriveLifecycle(current.generation, activeSource.fileId, "media-recovery-success", code);
      return { recovered, code };
    })().finally(() => {
      recoveryOperationRef.current = null;
    });
    recoveryOperationRef.current = operation;
    return operation;
  }, [ensureBound, patchCurrentGeneration]);

  return {
    state,
    mediaSrc: state.mediaSrc,
    errorMessage: state.errorCode ? driveMediaErrorMessage(state.errorCode) : null,
    markMediaLoading: () => markMediaState("MEDIA_LOADING"),
    markMediaReady: () => markMediaState("MEDIA_READY"),
    markPlayable: () => markMediaState("PLAYABLE"),
    recover,
    bindCurrent: async () => {
      const currentSource = sourceRef.current;
      return currentSource ? ensureInitiallyBound(stateRef.current.generation, currentSource, "explicit-bind") : false;
    }
  };
}

async function probeGatewayError(mediaSrc: string | null): Promise<string | null> {
  if (!mediaSrc) return "DRIVE_SESSION_NOT_BOUND";
  try {
    const response = await fetch(mediaSrc, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store"
    });
    return response.headers.get(GATEWAY_ERROR_HEADER);
  } catch {
    return "DRIVE_NETWORK_ERROR";
  }
}

function logDriveLifecycle(generation: number, fileId: string | null, state: string, reason: string): void {
  if (!import.meta.env.DEV) return;
  console.debug("[SyncRoom Drive lifecycle]", {
    generation,
    fileIdMasked: fileId ? `${fileId.slice(0, 4)}...${fileId.slice(-4)}` : null,
    state,
    reason
  });
}
