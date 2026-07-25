/* global self, URL, Response, Headers, fetch, console */

let mediaSession = null;

const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const GATEWAY_ERROR_HEADER = "X-SyncRoom-Drive-Error";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const replyPort = event.ports && event.ports[0];
  if (data.type === "BIND_DRIVE_MEDIA_SESSION") {
    if (!isValidBindingMessage(data)) return;
    mediaSession = {
      generation: data.generation,
      fileId: data.fileId,
      accessToken: data.accessToken,
      mimeType: data.mimeType,
      fileSizeBytes: data.fileSizeBytes
    };
    replyPort?.postMessage({
      type: "DRIVE_MEDIA_SESSION_BOUND",
      requestId: data.requestId,
      generation: data.generation,
      fileId: data.fileId
    });
    return;
  }
  if (data.type === "CLEAR_DRIVE_MEDIA_SESSION") {
    const expectedGeneration = data.expectedGeneration;
    const cleared = Boolean(mediaSession && mediaSession.generation === expectedGeneration);
    if (cleared) mediaSession = null;
    replyPort?.postMessage({
      type: "DRIVE_MEDIA_SESSION_CLEARED",
      requestId: data.requestId,
      generation: expectedGeneration,
      cleared
    });
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/__syncroom_drive_media__/")) return;
  event.respondWith(handleDriveMediaRequest(event.request, url));
});

async function handleDriveMediaRequest(request, url) {
  const fileId = decodeURIComponent(url.pathname.replace("/__syncroom_drive_media__/", ""));
  const requestedGeneration = Number(url.searchParams.get("generation"));
  if (!FILE_ID_PATTERN.test(fileId) || !Number.isSafeInteger(requestedGeneration) || requestedGeneration <= 0) {
    return gatewayError(400, "DRIVE_INVALID_MEDIA_REQUEST");
  }
  const session = mediaSession;
  if (!session || session.fileId !== fileId || session.generation !== requestedGeneration) {
    return gatewayError(428, "DRIVE_SESSION_NOT_BOUND");
  }

  const requestedRange = request.headers.get("Range");
  const parsedRange = requestedRange ? parseByteRange(requestedRange) : null;
  if (requestedRange && !parsedRange) return rangeNotSatisfiable(session.fileSizeBytes);
  if (parsedRange && parsedRange.start >= session.fileSizeBytes) return rangeNotSatisfiable(session.fileSizeBytes);

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  if (requestedRange) headers.set("Range", requestedRange);

  const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  let driveResponse;
  try {
    driveResponse = await fetch(driveUrl, {
      headers,
      cache: "no-store",
      signal: request.signal
    });
  } catch {
    return gatewayError(503, "DRIVE_NETWORK_ERROR");
  }

  if (driveResponse.status === 401) return gatewayError(401, "DRIVE_AUTH_REQUIRED");
  if (driveResponse.status === 403) return gatewayError(403, "DRIVE_ACCESS_DENIED");
  if (driveResponse.status === 404) return gatewayError(404, "DRIVE_ACCESS_DENIED");
  if (driveResponse.status === 416) return rangeNotSatisfiable(session.fileSizeBytes);
  if (!driveResponse.ok) return gatewayError(driveResponse.status, "DRIVE_NETWORK_ERROR");

  const upstreamContentLength = driveResponse.headers.get("Content-Length");
  const upstreamContentRangeVisible = driveResponse.headers.has("Content-Range");
  const responseHeaders = new Headers(driveResponse.headers);
  responseHeaders.set("Content-Type", driveResponse.headers.get("Content-Type") || session.mimeType);
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Content-Disposition", "inline");
  responseHeaders.set("Cache-Control", "no-store");
  let localContentRange = responseHeaders.get("Content-Range");

  if (driveResponse.status === 206 && parsedRange && !upstreamContentRangeVisible && upstreamContentLength) {
    const returnedLength = Number(upstreamContentLength);
    if (Number.isSafeInteger(returnedLength) && returnedLength > 0) {
      const returnedEnd = parsedRange.start + returnedLength - 1;
      localContentRange = `bytes ${parsedRange.start}-${returnedEnd}/${session.fileSizeBytes}`;
      responseHeaders.set("Content-Range", localContentRange);
    }
  }

  if (driveResponse.status === 200 && parsedRange && parsedRange.start > 0) {
    safeMediaLog({ requestedRange, upstreamStatus: driveResponse.status, localContentRange, generation: session.generation });
    return gatewayError(502, "DRIVE_RANGE_ERROR", rangeErrorHeaders(session.fileSizeBytes));
  }

  safeMediaLog({ requestedRange, upstreamStatus: driveResponse.status, localContentRange, generation: session.generation });
  return new Response(driveResponse.body, {
    status: driveResponse.status,
    statusText: driveResponse.statusText,
    headers: responseHeaders
  });
}

function isValidBindingMessage(data) {
  return (
    typeof data.requestId === "string" && data.requestId.length > 0 &&
    Number.isSafeInteger(data.generation) && data.generation > 0 &&
    typeof data.fileId === "string" && FILE_ID_PATTERN.test(data.fileId) &&
    typeof data.accessToken === "string" && data.accessToken.length >= 10 &&
    (data.mimeType === "video/mp4" || data.mimeType === "video/webm") &&
    Number.isSafeInteger(data.fileSizeBytes) && data.fileSizeBytes > 0
  );
}

function parseByteRange(rangeHeader) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] === "" ? null : Number(match[2]);
  if (!Number.isSafeInteger(start) || start < 0) return null;
  if (end !== null && (!Number.isSafeInteger(end) || end < start)) return null;
  return { start, end };
}

function rangeNotSatisfiable(fileSizeBytes) {
  return new Response(null, {
    status: 416,
    statusText: "Range Not Satisfiable",
    headers: rangeErrorHeaders(fileSizeBytes)
  });
}

function rangeErrorHeaders(fileSizeBytes) {
  const headers = new Headers();
  headers.set("Content-Range", `bytes */${fileSizeBytes}`);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "no-store");
  headers.set(GATEWAY_ERROR_HEADER, "DRIVE_RANGE_ERROR");
  return headers;
}

function gatewayError(status, code, existingHeaders) {
  const headers = existingHeaders ? new Headers(existingHeaders) : new Headers();
  headers.set(GATEWAY_ERROR_HEADER, code);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status, headers });
}

function safeMediaLog(data) {
  if (self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1") {
    console.info("[SyncRoom Drive media]", data);
  }
}
