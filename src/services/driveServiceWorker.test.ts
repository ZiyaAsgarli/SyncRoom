import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { driveMediaUrl, hasDriveServiceWorkerController, waitForDriveServiceWorkerController } from "./driveServiceWorker";

const serviceWorkerSource = readFileSync(resolve(process.cwd(), "public/syncroom-drive-sw.js"), "utf8");
const clientSource = readFileSync(resolve(process.cwd(), "src/services/driveServiceWorker.ts"), "utf8");

function installServiceWorkerMock(controller: ServiceWorker | null) {
  const listeners = new Map<string, EventListener>();
  const serviceWorker = {
    controller,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }),
    removeEventListener: vi.fn((type: string) => {
      listeners.delete(type);
    })
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorker
  });
  return { serviceWorker, listeners };
}

function createServiceWorkerHarness(fetchImpl: typeof fetch) {
  const serviceWorkerListeners = new Map<string, (event: { data?: unknown; ports?: Array<{ postMessage: (message: unknown) => void }> }) => void>();
  const context: Record<string, unknown> = {
    URL,
    Response,
    Headers,
    Number,
    fetch: fetchImpl,
    console: { info: vi.fn() },
    self: {
      location: { origin: "http://localhost:5173", hostname: "localhost" },
      clients: { claim: vi.fn() },
      skipWaiting: vi.fn(),
      addEventListener: vi.fn((type: string, listener: (event: { data?: unknown; ports?: Array<{ postMessage: (message: unknown) => void }> }) => void) => {
        serviceWorkerListeners.set(type, listener);
      })
    }
  };

  vm.runInNewContext(`${serviceWorkerSource}
this.__syncroomTest = { parseByteRange, handleDriveMediaRequest, setSession: (next) => { mediaSession = next; }, getSession: () => mediaSession };`, context);

  const testApi = context.__syncroomTest as {
    parseByteRange: (rangeHeader: string) => { start: number; end: number | null } | null;
    handleDriveMediaRequest: (request: { headers: Headers; signal?: AbortSignal }, url: URL) => Promise<Response>;
    setSession: (session: { generation: number; fileId: string; accessToken: string; mimeType: string; fileSizeBytes: number } | null) => void;
    getSession: () => { generation: number; fileId: string; accessToken: string; mimeType: string; fileSizeBytes: number } | null;
  };
  testApi.setSession({ generation: 1, fileId: "Drive_File-1234567890", accessToken: "secret-token-value", mimeType: "video/mp4", fileSizeBytes: 4_258_899 });
  return { testApi, context, serviceWorkerListeners };
}

describe("Drive service worker media helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates same-origin media URLs without embedding access tokens", () => {
    const url = driveMediaUrl("Drive_File-1234567890", 1);
    expect(url).toBe("/__syncroom_drive_media__/Drive_File-1234567890?generation=1");
    expect(url).not.toContain("token");
    expect(url).not.toContain("access_token");
  });

  it("rejects malformed media ids", () => {
    expect(() => driveMediaUrl("bad/path", 1)).toThrow("Invalid Drive file id");
  });

  it("service worker install and activate lifecycle takes control", () => {
    expect(serviceWorkerSource).toContain('self.addEventListener("install"');
    expect(serviceWorkerSource).toContain("self.skipWaiting()");
    expect(serviceWorkerSource).toContain('self.addEventListener("activate"');
    expect(serviceWorkerSource).toContain("self.clients.claim()");
  });

  it("registers the service worker with root scope", () => {
    expect(clientSource).toContain('navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE })');
    expect(clientSource).toContain('const SERVICE_WORKER_SCOPE = "/"');
  });

  it("active registration with null controller does not falsely report media ready", () => {
    installServiceWorkerMock(null);
    expect(hasDriveServiceWorkerController()).toBe(false);
  });

  it("controllerchange transitions the media gateway to ready without a reload loop", async () => {
    vi.useFakeTimers();
    const controller = { scriptURL: "http://localhost:5173/syncroom-drive-sw.js", postMessage: vi.fn() } as unknown as ServiceWorker;
    const { serviceWorker, listeners } = installServiceWorkerMock(null);
    const readyPromise = waitForDriveServiceWorkerController();
    expect(serviceWorker.addEventListener).toHaveBeenCalledTimes(1);
    expect(clientSource).not.toContain("location.reload");
    serviceWorker.controller = controller;
    listeners.get("controllerchange")?.(new Event("controllerchange"));
    await expect(readyPromise).resolves.toBe(controller);
  });

  it("does not add token persistence", () => {
    expect(clientSource).not.toContain("localStorage");
    expect(clientSource).not.toContain("sessionStorage");
    expect(clientSource).not.toContain("indexedDB");
    expect(clientSource).not.toContain("clearDriveToken");
  });

  it("parses supported single byte ranges and rejects invalid multiple ranges", () => {
    const { testApi } = createServiceWorkerHarness(vi.fn() as unknown as typeof fetch);
    expect(testApi.parseByteRange("bytes=0-")).toEqual({ start: 0, end: null });
    expect(testApi.parseByteRange("bytes=1000000-")).toEqual({ start: 1_000_000, end: null });
    expect(testApi.parseByteRange("bytes=1000000-1999999")).toEqual({ start: 1_000_000, end: 1_999_999 });
    expect(testApi.parseByteRange("bytes=0-1,2-3")).toBeNull();
  });

  it("passes file size and mime type to the in-memory worker session without token persistence", () => {
    expect(clientSource).toContain("fileSizeBytes");
    expect(clientSource).toContain("mimeType");
    expect(clientSource).toContain('type: "BIND_DRIVE_MEDIA_SESSION"');
    expect(clientSource).toContain("fileSizeBytes: nextBinding.fileSizeBytes");
    expect(clientSource).not.toContain("localStorage");
    expect(clientSource).not.toContain("sessionStorage");
    expect(clientSource).not.toContain("indexedDB");
  });

  it("forwards incoming Range to Google Drive media fetch without putting tokens in URLs", async () => {
    const fetchMock = vi.fn(async () => new Response(new ReadableStream(), { status: 206, headers: { "Content-Length": "100" } })) as unknown as typeof fetch;
    const { testApi } = createServiceWorkerHarness(fetchMock);
    await testApi.handleDriveMediaRequest({ headers: new Headers({ Range: "bytes=1000-" }) }, new URL("http://localhost:5173/__syncroom_drive_media__/Drive_File-1234567890?generation=1"));
    const requestUrl = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const requestHeaders = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].headers as Headers;
    expect(requestHeaders.get("Range")).toBe("bytes=1000-");
    expect(requestHeaders.get("Authorization")).toBe("Bearer secret-token-value");
    expect(requestUrl).toContain("?alt=media");
    expect(requestUrl).not.toContain("token");
    expect(requestUrl).not.toContain("access_token");
  });

  it("preserves normal 200 media status, headers, and streamed body", async () => {
    const body = new ReadableStream();
    const fetchMock = vi.fn(async () => new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": "4258899"
      }
    })) as unknown as typeof fetch;
    const { testApi } = createServiceWorkerHarness(fetchMock);
    const response = await testApi.handleDriveMediaRequest({ headers: new Headers() }, new URL("http://localhost:5173/__syncroom_drive_media__/Drive_File-1234567890?generation=1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Length")).toBe("4258899");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.body).toBe(body);
    expect(serviceWorkerSource).not.toContain("arrayBuffer()");
    expect(serviceWorkerSource).not.toContain("blob()");
  });

  it("synthesizes Content-Range when upstream 206 hides it", async () => {
    const fetchMock = vi.fn(async () => new Response(new ReadableStream(), {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": "4258899",
        "Content-Disposition": "attachment"
      }
    })) as unknown as typeof fetch;
    const { testApi } = createServiceWorkerHarness(fetchMock);
    const response = await testApi.handleDriveMediaRequest({ headers: new Headers({ Range: "bytes=0-" }) }, new URL("http://localhost:5173/__syncroom_drive_media__/Drive_File-1234567890?generation=1"));
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-4258898/4258899");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Length")).toBe("4258899");
    expect(response.headers.get("Content-Disposition")).toBe("inline");
  });

  it("calculates non-zero range end from returned Content-Length", async () => {
    const fetchMock = vi.fn(async () => new Response(new ReadableStream(), {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": "1000"
      }
    })) as unknown as typeof fetch;
    const { testApi } = createServiceWorkerHarness(fetchMock);
    const response = await testApi.handleDriveMediaRequest({ headers: new Headers({ Range: "bytes=1000000-" }) }, new URL("http://localhost:5173/__syncroom_drive_media__/Drive_File-1234567890?generation=1"));
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 1000000-1000999/4258899");
  });

  it("returns 416 when requested range starts beyond file size", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const { testApi } = createServiceWorkerHarness(fetchMock);
    const response = await testApi.handleDriveMediaRequest({ headers: new Headers({ Range: "bytes=4258899-" }) }, new URL("http://localhost:5173/__syncroom_drive_media__/Drive_File-1234567890?generation=1"));
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */4258899");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not falsely label upstream 200 for unsupported non-zero range as 206", async () => {
    const fetchMock = vi.fn(async () => new Response(new ReadableStream(), {
      status: 200,
      headers: { "Content-Length": "4258899", "Content-Type": "video/mp4" }
    })) as unknown as typeof fetch;
    const { testApi } = createServiceWorkerHarness(fetchMock);
    const response = await testApi.handleDriveMediaRequest({ headers: new Headers({ Range: "bytes=1000-" }) }, new URL("http://localhost:5173/__syncroom_drive_media__/Drive_File-1234567890?generation=1"));
    expect(response.status).toBe(502);
    expect(response.status).not.toBe(206);
  });

  it("atomically binds a generation and acknowledges only after installation", () => {
    const { testApi, serviceWorkerListeners } = createServiceWorkerHarness(vi.fn() as unknown as typeof fetch);
    const acknowledgements: unknown[] = [];
    serviceWorkerListeners.get("message")?.({
      data: {
        type: "BIND_DRIVE_MEDIA_SESSION",
        requestId: "request-2",
        generation: 2,
        fileId: "Drive_File-ABCDEFGHIJ",
        accessToken: "replacement-secret-token",
        mimeType: "video/mp4",
        fileSizeBytes: 5_000_000
      },
      ports: [{ postMessage: (message) => acknowledgements.push(message) }]
    });
    expect(testApi.getSession()).toMatchObject({ generation: 2, fileId: "Drive_File-ABCDEFGHIJ" });
    expect(acknowledgements).toEqual([expect.objectContaining({ type: "DRIVE_MEDIA_SESSION_BOUND", requestId: "request-2", generation: 2 })]);
  });

  it("stale cleanup cannot clear a newer worker generation", () => {
    const { testApi, serviceWorkerListeners } = createServiceWorkerHarness(vi.fn() as unknown as typeof fetch);
    testApi.setSession({ generation: 2, fileId: "Drive_File-ABCDEFGHIJ", accessToken: "replacement-secret-token", mimeType: "video/mp4", fileSizeBytes: 5_000_000 });
    const acknowledgements: unknown[] = [];
    serviceWorkerListeners.get("message")?.({
      data: { type: "CLEAR_DRIVE_MEDIA_SESSION", requestId: "stale-clear", expectedGeneration: 1 },
      ports: [{ postMessage: (message) => acknowledgements.push(message) }]
    });
    expect(testApi.getSession()).toMatchObject({ generation: 2, fileId: "Drive_File-ABCDEFGHIJ" });
    expect(acknowledgements).toEqual([expect.objectContaining({ cleared: false, generation: 1 })]);
  });

  it("returns a deterministic recoverable status for a missing or stale session", async () => {
    const { testApi } = createServiceWorkerHarness(vi.fn() as unknown as typeof fetch);
    testApi.setSession(null);
    const response = await testApi.handleDriveMediaRequest(
      { headers: new Headers({ Range: "bytes=0-" }) },
      new URL("http://localhost:5173/__syncroom_drive_media__/Drive_File-1234567890?generation=1")
    );
    expect(response.status).toBe(428);
    expect(response.headers.get("X-SyncRoom-Drive-Error")).toBe("DRIVE_SESSION_NOT_BOUND");
  });
});
