import type { Session } from "@supabase/supabase-js";

export interface SynchronousAuthHandlerOptions {
  setInitialSessionResolved: (value: boolean) => void;
  setAuthLoading: (value: boolean) => void;
  setSession: (session: Session | null) => void;
  handleSignedOut: () => void;
  log?: (message: string, data?: Record<string, string>) => void;
}

export function handleAuthStateSynchronously(
  event: string,
  nextSession: Session | null,
  options: SynchronousAuthHandlerOptions
): void {
  options.log?.("[SyncRoom auth] auth callback entered", { event });
  try {
    options.setInitialSessionResolved(true);
    options.setAuthLoading(false);
    options.setSession(nextSession);
    if (event === "SIGNED_OUT") {
      options.handleSignedOut();
    }
  } finally {
    options.log?.("[SyncRoom auth] auth callback returned");
  }
}

export function isStaleProfileResult(input: {
  capturedGeneration: number;
  currentGeneration: number;
  capturedUserId: string;
  currentUserId: string | null;
  cancelled: boolean;
}): boolean {
  return input.cancelled || input.capturedGeneration !== input.currentGeneration || input.capturedUserId !== input.currentUserId;
}
