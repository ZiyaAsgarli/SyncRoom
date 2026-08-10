import type { Profile } from "../types/database";

export interface ProfileSyncErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

export interface ProfileSyncCoordinator {
  sync: (userId: string, options?: { force?: boolean }) => Promise<Profile>;
  clearUser: (userId: string) => void;
  clearAll: () => void;
  hasInFlight: (userId: string) => boolean;
  getCallCount: () => number;
}

const TRANSIENT_CODES = new Set(["PGRST003", "57014", "53300", "08006", "08001"]);
const DEFAULT_TIMEOUT_MS = 12_000;

export function isUnauthorizedProfileError(error: unknown): boolean {
  const candidate = toErrorLike(error);
  return /not invited|not authorized|unauthorized|access.+removed|access.+inactive|revoked/i.test(candidate.message ?? "");
}

export function isTransientProfileSyncError(error: unknown): boolean {
  const candidate = toErrorLike(error);
  if (candidate.code && TRANSIENT_CODES.has(candidate.code)) return true;
  if (candidate.status && candidate.status >= 500) return true;
  return /timeout|timed out|connection pool|network|failed to fetch/i.test(candidate.message ?? "");
}

export function shouldSignOutForProfileSyncError(error: unknown): boolean {
  return isUnauthorizedProfileError(error);
}

export function isRevokedAccessError(error: unknown): boolean {
  const candidate = toErrorLike(error);
  return /access.+removed|access.+inactive|revoked/i.test(candidate.message ?? "");
}

export function createProfileSyncCoordinator(syncProfile: () => Promise<Profile>, options: { retryLimit?: number; baseDelayMs?: number; timeoutMs?: number } = {}): ProfileSyncCoordinator {
  const inFlight = new Map<string, Promise<Profile>>();
  const cache = new Map<string, Profile>();
  const retryLimit = options.retryLimit ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let callCount = 0;

  async function runWithRetry(userId: string): Promise<Profile> {
    let attempt = 0;
    while (true) {
      try {
        callCount += 1;
        if (import.meta.env.DEV) console.info("[SyncRoom auth] profile sync started");
        const profile = await withTimeout(syncProfile(), timeoutMs);
        cache.set(userId, profile);
        if (import.meta.env.DEV) console.info("[SyncRoom auth] profile sync succeeded");
        return profile;
      } catch (error) {
        if (!isTransientProfileSyncError(error) || attempt >= retryLimit) {
          if (isUnauthorizedProfileError(error) && import.meta.env.DEV) console.info("[SyncRoom auth] unauthorized account confirmed");
          if (isTransientProfileSyncError(error) && import.meta.env.DEV) console.info("[SyncRoom auth] transient profile sync failure");
          throw error;
        }
        const delay = baseDelayMs * 2 ** attempt;
        if (import.meta.env.DEV) console.info("[SyncRoom auth] retry scheduled", { attempt: attempt + 1 });
        await wait(delay);
        attempt += 1;
      }
    }
  }

  return {
    sync: (userId, options = {}) => {
      if (!options.force) {
        const cached = cache.get(userId);
        if (cached) return Promise.resolve(cached);
      }
      const existing = inFlight.get(userId);
      if (existing) {
        if (import.meta.env.DEV) console.info("[SyncRoom auth] existing in-flight request reused");
        return existing;
      }
      const request = runWithRetry(userId).finally(() => inFlight.delete(userId));
      request.then(() => {
        if (import.meta.env.DEV) console.info("[SyncRoom auth] in-flight entry cleared");
      }, () => {
        if (import.meta.env.DEV) console.info("[SyncRoom auth] in-flight entry cleared");
      });
      inFlight.set(userId, request);
      return request;
    },
    clearUser: (userId) => {
      cache.delete(userId);
      inFlight.delete(userId);
    },
    clearAll: () => {
      cache.clear();
      inFlight.clear();
    },
    hasInFlight: (userId) => inFlight.has(userId),
    getCallCount: () => callCount
  };
}

function toErrorLike(error: unknown): ProfileSyncErrorLike {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === "string" ? record.code : undefined,
      status: typeof record.status === "number" ? record.status : undefined,
      message: typeof record.message === "string" ? record.message : undefined
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (import.meta.env.DEV) console.info("[SyncRoom auth] profile request timed out");
      reject({ code: "SYNC_PROFILE_TIMEOUT", status: 504, message: "Profile sync timed out." });
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}
