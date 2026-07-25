import type { RoomPlaybackState } from "../types/database";
import type { RoomMediaSource } from "../types/mediaSource";

export function playbackStateToMediaSource(snapshot: RoomPlaybackState | null): RoomMediaSource | null {
  if (!snapshot) return null;
  if (snapshot.source_type === "youtube" && snapshot.youtube_video_id) {
    return { type: "youtube", videoId: snapshot.youtube_video_id };
  }
  if (
    snapshot.source_type === "google_drive" &&
    snapshot.drive_file_id &&
    snapshot.drive_file_name &&
    (snapshot.drive_mime_type === "video/mp4" || snapshot.drive_mime_type === "video/webm")
  ) {
    return {
      type: "google_drive",
      fileId: snapshot.drive_file_id,
      name: snapshot.drive_file_name,
      mimeType: snapshot.drive_mime_type,
      size: snapshot.drive_file_size,
      modifiedTime: snapshot.drive_modified_time
    };
  }
  return null;
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "Size unknown";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
