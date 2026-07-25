import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateDriveTokenExpiresAt,
  clearDriveToken,
  getDriveAuthSnapshot,
  requestDriveAccessToken
} from "./driveAuth";

vi.mock("../config/drive", () => ({
  DRIVE_SCOPE: "https://www.googleapis.com/auth/drive.file",
  getDriveEnvironment: () => ({ configured: true, missing: [], clientId: "test-client.apps.googleusercontent.com" })
}));

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TestTokenClient {
  callback?: (response: TokenResponse) => void;
  requestAccessToken: ReturnType<typeof vi.fn>;
}

const tokenClient: TestTokenClient = { requestAccessToken: vi.fn() };
let errorCallback: ((error: unknown) => void) | undefined;

describe("Drive browser-session authorization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearDriveToken();
    tokenClient.callback = undefined;
    tokenClient.requestAccessToken.mockReset();
    Object.defineProperty(window, "google", {
      configurable: true,
      value: {
        accounts: {
          oauth2: {
            initTokenClient: vi.fn((config: { error_callback?: (error: unknown) => void }) => {
              errorCallback = config.error_callback;
              return tokenClient;
            })
          }
        }
      }
    });
  });

  afterEach(() => {
    clearDriveToken();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("converts GIS expires_in seconds to milliseconds", () => {
    expect(calculateDriveTokenExpiresAt(1_000, 3600)).toBe(3_601_000);
  });

  it("single-flights concurrent OAuth requests and reuses a valid token", async () => {
    const first = requestDriveAccessToken();
    const second = requestDriveAccessToken();
    await vi.waitFor(() => expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(1));
    tokenClient.callback?.({ access_token: "memory-only-token", expires_in: 3600 });
    await expect(first).resolves.toBe("memory-only-token");
    await expect(second).resolves.toBe("memory-only-token");

    await expect(requestDriveAccessToken()).resolves.toBe("memory-only-token");
    expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(1);
    expect(getDriveAuthSnapshot().reconnectRequired).toBe(false);
  });

  it("does not request OAuth again after one minute when the token is valid", async () => {
    const request = requestDriveAccessToken();
    await vi.waitFor(() => expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(1));
    tokenClient.callback?.({ access_token: "memory-only-token", expires_in: 3600 });
    await request;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(1);
    expect(getDriveAuthSnapshot().tokenValid).toBe(true);
  });

  it("silently renews before expiry without showing reconnect", async () => {
    const request = requestDriveAccessToken();
    await vi.waitFor(() => expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(1));
    tokenClient.callback?.({ access_token: "first-memory-token", expires_in: 120 });
    await request;

    await vi.advanceTimersByTimeAsync(30_000);
    expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(2);
    expect(tokenClient.requestAccessToken).toHaveBeenLastCalledWith({ prompt: "" });
    tokenClient.callback?.({ access_token: "renewed-memory-token", expires_in: 3600 });
    await Promise.resolve();
    expect(getDriveAuthSnapshot().reconnectRequired).toBe(false);
  });

  it("asks for one user reconnect only after silent renewal fails and the token expires", async () => {
    const request = requestDriveAccessToken();
    await vi.waitFor(() => expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(1));
    tokenClient.callback?.({ access_token: "short-memory-token", expires_in: 100 });
    await request;

    await vi.advanceTimersByTimeAsync(10_000);
    errorCallback?.(new Error("interaction required"));
    await vi.advanceTimersByTimeAsync(90_000);
    expect(getDriveAuthSnapshot().tokenValid).toBe(false);
    expect(getDriveAuthSnapshot().reconnectRequired).toBe(true);
    expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(2);
  });
});
