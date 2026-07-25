import type { Room, RoomPlaybackState } from "../types/database";

export function canControlPlayback(room: Room, userId: string): boolean {
  return room.status !== "ended" && room.host_user_id === userId;
}

export function shouldResetSource(previous: RoomPlaybackState | null, nextVideoId: string): boolean {
  return previous?.youtube_video_id !== nextVideoId;
}
