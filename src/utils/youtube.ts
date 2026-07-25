const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export type YouTubeParseResult = { ok: true; videoId: string } | { ok: false; error: string };

export function isValidYouTubeVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value);
}

export function parseYouTubeUrl(input: string): YouTubeParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Paste a YouTube link first." };
  if (raw.includes("<iframe") || raw.includes("</")) return { ok: false, error: "Paste a YouTube URL, not embed HTML." };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "That does not look like a valid URL." };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId: string | null = null;

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v");
    const embedMatch = url.pathname.match(/^\/embed\/([^/?#]+)/);
    const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
    videoId = videoId ?? embedMatch?.[1] ?? shortsMatch?.[1] ?? null;
  } else if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else {
    return { ok: false, error: "Use a youtube.com or youtu.be link." };
  }

  if (!videoId || !isValidYouTubeVideoId(videoId)) {
    return { ok: false, error: "That YouTube link does not contain a valid video ID." };
  }

  return { ok: true, videoId };
}
