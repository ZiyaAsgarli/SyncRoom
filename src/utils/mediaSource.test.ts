import { describe, expect, it } from "vitest";
import type { RoomPlaybackState } from "../types/database";
import { formatFileSize, playbackStateToMediaSource } from "./mediaSource";

const baseSnapshot: RoomPlaybackState = {
  room_id: "00000000-0000-4000-8000-000000000001",
  source_type: "youtube",
  youtube_video_id: "dQw4w9WgXcQ",
  drive_file_id: null,
  drive_file_name: null,
  drive_mime_type: null,
  drive_file_size: null,
  drive_modified_time: null,
  playback_status: "cued",
  current_time_seconds: 0,
  playback_rate: 1,
  duration_seconds: null,
  state_version: 1,
  updated_by: null,
  updated_at: "2026-07-23T12:00:00.000Z"
};

describe("media source conversion", () => {
  it("converts YouTube and Google Drive playback snapshots", () => {
    expect(playbackStateToMediaSource(baseSnapshot)).toEqual({ type: "youtube", videoId: "dQw4w9WgXcQ" });
    expect(playbackStateToMediaSource({
      ...baseSnapshot,
      source_type: "google_drive",
      youtube_video_id: null,
      drive_file_id: "Drive_File-1234567890",
      drive_file_name: "movie.webm",
      drive_mime_type: "video/webm",
      drive_file_size: 2048
    })).toEqual({
      type: "google_drive",
      fileId: "Drive_File-1234567890",
      name: "movie.webm",
      mimeType: "video/webm",
      size: 2048,
      modifiedTime: null
    });
  });

  it("ignores incomplete Drive state and formats private file sizes", () => {
    expect(playbackStateToMediaSource({ ...baseSnapshot, source_type: "google_drive", youtube_video_id: null })).toBeNull();
    expect(formatFileSize(null)).toBe("Size unknown");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });
});
