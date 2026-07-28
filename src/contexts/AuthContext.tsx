import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../config/routes";
import { supabase } from "../lib/supabase";
import { checkPrivateAccess, privateProfileSync, signOut } from "../services/authService";
import { isRevokedAccessError, isTransientProfileSyncError, shouldSignOutForProfileSyncError } from "../services/profileSyncCoordinator";
import type { Profile } from "../types/database";
import { handleAuthStateSynchronously, isStaleProfileResult } from "../utils/authLifecycle";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./authContextValue";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [transientProfileError, setTransientProfileError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [initialSessionResolved, setInitialSessionResolved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const navigate = useNavigate();
  const authGeneration = useRef(0);
  const signedOutForDeniedUser = useRef<string | null>(null);
  const lastUserId = useRef<string | null>(null);

  const denyAndSignOut = useCallback(async (deniedUserId: string, revoked: boolean) => {
    privateProfileSync.clearUser(deniedUserId);
    setProfile(null);
    setAccessDenied(true);
    setStatus("denied");
    const message = revoked
      ? "Your access to this private SyncRoom has been removed."
      : "That Google account is not invited to this private SyncRoom.";
    setAuthError(message);
    if (signedOutForDeniedUser.current !== deniedUserId) {
      signedOutForDeniedUser.current = deniedUserId;
      setSigningOut(true);
      try {
        await signOut();
      } finally {
        setSigningOut(false);
      }
    }
    navigate(ROUTES.accessDenied, { replace: true, state: { revoked } });
  }, [navigate]);

  const clearProfileState = useCallback(() => {
    setProfile(null);
    setProfileLoading(false);
    setTransientProfileError(null);
    setAuthError(null);
    setAccessDenied(false);
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      handleAuthStateSynchronously(event, nextSession, {
        setInitialSessionResolved,
        setAuthLoading,
        setSession,
        handleSignedOut: () => {
          authGeneration.current += 1;
          lastUserId.current = null;
          signedOutForDeniedUser.current = null;
          privateProfileSync.clearAll();
          clearProfileState();
          setStatus("anonymous");
        },
        log: import.meta.env.DEV ? (message, data) => console.info(message, data) : undefined
      });
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [clearProfileState]);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!initialSessionResolved) return;

    if (!userId) {
      authGeneration.current += 1;
      lastUserId.current = null;
      clearProfileState();
      setStatus("anonymous");
      return;
    }

    const userChanged = lastUserId.current !== userId;
    if (userChanged) {
      authGeneration.current += 1;
      lastUserId.current = userId;
      signedOutForDeniedUser.current = null;
      setProfile(null);
      setAccessDenied(false);
      setTransientProfileError(null);
      setAuthError(null);
      if (import.meta.env.DEV) console.info("[SyncRoom auth] session user changed");
    }

    const generation = authGeneration.current;
    const force = refreshNonce > 0;
    let cancelled = false;
    if (import.meta.env.DEV) console.info("[SyncRoom auth] profile effect scheduled");
    setProfileLoading(true);
    setStatus("loading");

    void privateProfileSync.sync(userId, { force }).then(async (synced) => {
      if (isStaleProfileResult({ cancelled, capturedGeneration: generation, currentGeneration: authGeneration.current, capturedUserId: userId, currentUserId: lastUserId.current })) {
        if (import.meta.env.DEV) console.info("[SyncRoom auth] stale profile result ignored");
        return;
      }
      if (import.meta.env.DEV) console.info("[SyncRoom auth] profile request completed");
      setProfile(synced);
      setAccessDenied(false);
      setTransientProfileError(null);
      setAuthError(null);
      setProfileLoading(false);
      setStatus("allowed");
    }).catch(async (error: unknown) => {
      if (isStaleProfileResult({ cancelled, capturedGeneration: generation, currentGeneration: authGeneration.current, capturedUserId: userId, currentUserId: lastUserId.current })) {
        if (import.meta.env.DEV) console.info("[SyncRoom auth] stale profile result ignored");
        return;
      }
      if (import.meta.env.DEV) console.info("[SyncRoom auth] profile request failed");
      console.error(error);
      setProfileLoading(false);

      if (shouldSignOutForProfileSyncError(error)) {
        await denyAndSignOut(userId, isRevokedAccessError(error));
        return;
      }

      const message = isTransientProfileSyncError(error)
        ? "Could not load your private profile. Retry."
        : "Could not load your private profile. Retry.";
      setTransientProfileError(message);
      setAuthError(message);
      setStatus("profile_error");
    });

    return () => {
      cancelled = true;
    };
  }, [clearProfileState, denyAndSignOut, initialSessionResolved, refreshNonce, userId]);

  useEffect(() => {
    if (!userId || profile?.user_id !== userId || status !== "allowed") return;

    let disposed = false;
    let requestInFlight = false;
    const verifyCurrentAccess = async () => {
      if (disposed || requestInFlight) return;
      requestInFlight = true;
      try {
        await checkPrivateAccess();
      } catch (error) {
        if (!disposed && shouldSignOutForProfileSyncError(error)) {
          await denyAndSignOut(userId, isRevokedAccessError(error));
        }
      } finally {
        requestInFlight = false;
      }
    };

    const handleVisible = () => {
      if (document.visibilityState === "visible") void verifyCurrentAccess();
    };
    const intervalId = window.setInterval(() => void verifyCurrentAccess(), 60_000);
    window.addEventListener("online", verifyCurrentAccess);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener("online", verifyCurrentAccess);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [denyAndSignOut, profile?.user_id, status, userId]);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    setTransientProfileError(null);
    setAuthError(null);
    setRefreshNonce((value) => value + 1);
  }, [userId]);

  const signOutAndReturn = useCallback(async () => {
    if (userId) privateProfileSync.clearUser(userId);
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
    setSession(null);
    clearProfileState();
    setAuthLoading(false);
    setInitialSessionResolved(true);
    setStatus("anonymous");
    navigate(ROUTES.login, { replace: true });
  }, [clearProfileState, navigate, userId]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    status,
    authError,
    authLoading,
    profileLoading,
    authenticated: Boolean(session),
    profileReady: Boolean(profile) && status === "allowed",
    transientProfileError,
    accessDenied,
    initialSessionResolved,
    signingOut,
    refreshProfile,
    signOutAndReturn
  }), [accessDenied, authError, authLoading, initialSessionResolved, profile, profileLoading, refreshProfile, session, signOutAndReturn, signingOut, status, transientProfileError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
