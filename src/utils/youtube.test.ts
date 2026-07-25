import { describe, expect, it } from "vitest";
import { isValidYouTubeVideoId, parseYouTubeUrl } from "./youtube";

describe("YouTube URL parser", () => {
  const id = "dQw4w9WgXcQ";

  it.each([
    `https://youtube.com/watch?v=${id}&t=42`,
    `https://www.youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=test`,
    `https://youtube.com/embed/${id}`,
    `https://youtube.com/shorts/${id}`
  ])("extracts video id from %s", (url) => {
    expect(parseYouTubeUrl(url)).toEqual({ ok: true, videoId: id });
  });

  it("rejects malformed input and iframe html", () => {
    expect(parseYouTubeUrl("not a url").ok).toBe(false);
    expect(parseYouTubeUrl(`<iframe src="https://youtube.com/embed/${id}"></iframe>`).ok).toBe(false);
  });

  it("validates video id shape", () => {
    expect(isValidYouTubeVideoId(id)).toBe(true);
    expect(isValidYouTubeVideoId("too-short")).toBe(false);
  });
});
