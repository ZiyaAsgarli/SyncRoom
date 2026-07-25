import { DRIVE_SCOPE, getDriveEnvironment } from "../config/drive";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
  callback?: (response: GoogleTokenResponse) => void;
}

export interface DriveAuthSnapshot {
  authorized: boolean;
  tokenValid: boolean;
  expiresAt: number | null;
  expiryRemainingSeconds: number;
  reconnectRequired: boolean;
}

interface DriveTokenState {
  accessToken: string;
  expiresAt: number;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: unknown) => void;
          }) => GoogleTokenClient;
        };
      };
      picker?: unknown;
    };
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
  }
}

const TOKEN_VALIDITY_MARGIN_MS = 30_000;
const SILENT_REFRESH_LEAD_MS = 90_000;
let gisPromise: Promise<void> | null = null;
let tokenClient: GoogleTokenClient | null = null;
let tokenState: DriveTokenState | null = null;
let tokenRequest: Promise<string> | null = null;
let tokenClientErrorHandler: ((error: unknown) => void) | null = null;
let refreshTimer: number | null = null;
let reconnectRequired = false;
const listeners = new Set<(snapshot: DriveAuthSnapshot) => void>();

export function calculateDriveTokenExpiresAt(nowMs: number, expiresInSeconds: number | undefined): number {
  return nowMs + Math.max(0, expiresInSeconds ?? 3600) * 1000;
}

export function getDriveAuthSnapshot(nowMs = Date.now()): DriveAuthSnapshot {
  const expiresAt = tokenState?.expiresAt ?? null;
  const expiryRemainingSeconds = expiresAt === null ? 0 : Math.max(0, Math.ceil((expiresAt - nowMs) / 1000));
  return {
    authorized: tokenState !== null,
    tokenValid: Boolean(tokenState && tokenState.expiresAt > nowMs + TOKEN_VALIDITY_MARGIN_MS),
    expiresAt,
    expiryRemainingSeconds,
    reconnectRequired
  };
}

export function getValidDriveAccessToken(nowMs = Date.now()): string | null {
  return tokenState && tokenState.expiresAt > nowMs + TOKEN_VALIDITY_MARGIN_MS ? tokenState.accessToken : null;
}

export function getUsableDriveAccessToken(nowMs = Date.now()): string | null {
  return tokenState && tokenState.expiresAt > nowMs ? tokenState.accessToken : null;
}

export function subscribeDriveAuth(listener: (snapshot: DriveAuthSnapshot) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDriveTokenForTests(): string | null {
  return tokenState?.accessToken ?? null;
}

export function clearDriveToken(): void {
  tokenState = null;
  reconnectRequired = false;
  clearRefreshTimer();
  notifyListeners();
}

export async function requestDriveAccessToken(options: { forcePrompt?: boolean; silent?: boolean; forceRefresh?: boolean } = {}): Promise<string> {
  const env = getDriveEnvironment();
  if (!env.configured) throw new Error(`Drive is not configured: ${env.missing.join(", ")}`);
  const validToken = getValidDriveAccessToken();
  if (!options.forceRefresh && validToken) {
    logDriveSession("token valid");
    return validToken;
  }
  if (tokenRequest) return tokenRequest;
  if (options.silent && !tokenState) throw new Error("Drive authorization requires a user action.");

  tokenRequest = requestNewToken(env.clientId, options).finally(() => {
    tokenRequest = null;
  });
  return tokenRequest;
}

async function requestNewToken(clientId: string, options: { forcePrompt?: boolean }): Promise<string> {
  await loadGoogleIdentityServices();
  const client = getTokenClient(clientId);
  return new Promise((resolve, reject) => {
    const finishWithError = (error: unknown) => {
      const message = error instanceof Error ? error.message : "Drive authorization failed.";
      reject(new Error(message));
    };
    tokenClientErrorHandler = finishWithError;
    client.callback = (response) => {
      tokenClientErrorHandler = null;
      if (response.error) {
        finishWithError(response.error === "access_denied" ? new Error("Drive permission was denied.") : new Error("Drive authorization failed."));
        return;
      }
      if (!response.access_token) {
        finishWithError(new Error("Drive authorization was cancelled."));
        return;
      }
      tokenState = {
        accessToken: response.access_token,
        expiresAt: calculateDriveTokenExpiresAt(Date.now(), response.expires_in)
      };
      reconnectRequired = false;
      scheduleSilentRefresh();
      notifyListeners();
      logDriveSession("authorized");
      resolve(response.access_token);
    };

    try {
      client.requestAccessToken({ prompt: options.forcePrompt ? "consent" : tokenState ? "" : "consent" });
    } catch (error) {
      tokenClientErrorHandler = null;
      finishWithError(error);
    }
  });
}

function getTokenClient(clientId: string): GoogleTokenClient {
  if (tokenClient) return tokenClient;
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services is unavailable.");
  tokenClient = oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: () => undefined,
    error_callback: (error) => {
      const handler = tokenClientErrorHandler;
      tokenClientErrorHandler = null;
      handler?.(error);
    }
  });
  return tokenClient;
}

function scheduleSilentRefresh(): void {
  clearRefreshTimer();
  if (!tokenState) return;
  const delayMs = Math.max(0, tokenState.expiresAt - Date.now() - SILENT_REFRESH_LEAD_MS);
  refreshTimer = window.setTimeout(() => {
    logDriveSession("silent refresh attempted");
    void requestDriveAccessToken({ silent: true, forceRefresh: true }).catch(() => {
      const expired = !tokenState || tokenState.expiresAt <= Date.now();
      reconnectRequired = expired;
      notifyListeners();
      if (expired) {
        logDriveSession("user reconnect required");
      } else if (tokenState) {
        clearRefreshTimer();
        refreshTimer = window.setTimeout(() => {
          reconnectRequired = true;
          notifyListeners();
          logDriveSession("user reconnect required");
        }, Math.max(0, tokenState.expiresAt - Date.now()));
      }
    });
  }, delayMs);
}

function clearRefreshTimer(): void {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = null;
}

function notifyListeners(): void {
  const snapshot = getDriveAuthSnapshot();
  for (const listener of listeners) listener(snapshot);
}

function logDriveSession(state: string): void {
  if (!import.meta.env.DEV) return;
  const snapshot = getDriveAuthSnapshot();
  console.debug("[SyncRoom Drive session]", {
    state,
    tokenValid: snapshot.tokenValid,
    tokenExpiryRemainingSeconds: snapshot.expiryRemainingSeconds
  });
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity Services could not load."));
    document.head.appendChild(script);
  });
  return gisPromise;
}
