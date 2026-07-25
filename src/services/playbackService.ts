import { supabase } from "../lib/supabase";
import type { PlaybackStatus, RoomPlaybackState } from "../types/database";
import type { DriveFileMetadata } from "./driveMetadata";

type PlaybackRpc = {
  (fn: "set_room_youtube_source", args: { room_id_input: string; youtube_video_id_input: string }): Promise<{ data: RoomPlaybackState; error: Error | null }>;
  (fn: "set_room_drive_source", args: {
    room_id_input: string;
    drive_file_id_input: string;
    drive_file_name_input: string;
    drive_mime_type_input: string;
    drive_file_size_input: number | null;
    drive_modified_time_input: string | null;
  }): Promise<{ data: RoomPlaybackState; error: Error | null }>;
  (fn: "update_room_playback_state", args: {
    room_id_input: string;
    expected_state_version: number;
    playback_status_input: PlaybackStatus;
    current_time_seconds_input: number;
    playback_rate_input: number;
    duration_seconds_input: number | null;
    increment_state_version_input?: boolean;
  }): Promise<{ data: RoomPlaybackState; error: Error | null }>;
  (fn: "get_room_playback_snapshot", args: { room_id_input: string }): Promise<{ data: RoomPlaybackState | null; error: Error | null }>;
};

const playbackRpc = supabase.rpc.bind(supabase) as unknown as PlaybackRpc;

export async function setRoomYouTubeSource(roomId: string, videoId: string): Promise<RoomPlaybackState> {
  const { data, error } = await playbackRpc("set_room_youtube_source", { room_id_input: roomId, youtube_video_id_input: videoId });
  if (error) throw error;
  return data;
}

export async function setRoomDriveSource(roomId: string, file: DriveFileMetadata): Promise<RoomPlaybackState> {
  const { data, error } = await playbackRpc("set_room_drive_source", {
    room_id_input: roomId,
    drive_file_id_input: file.id,
    drive_file_name_input: file.name,
    drive_mime_type_input: file.mimeType,
    drive_file_size_input: file.size,
    drive_modified_time_input: file.modifiedTime
  });
  if (error) throw error;
  return data;
}

export async function updateRoomPlaybackState(input: {
  roomId: string;
  expectedStateVersion: number;
  playbackStatus: PlaybackStatus;
  currentTimeSeconds: number;
  playbackRate: number;
  durationSeconds: number | null;
  incrementStateVersion?: boolean;
}): Promise<RoomPlaybackState> {
  const { data, error } = await playbackRpc("update_room_playback_state", {
    room_id_input: input.roomId,
    expected_state_version: input.expectedStateVersion,
    playback_status_input: input.playbackStatus,
    current_time_seconds_input: input.currentTimeSeconds,
    playback_rate_input: input.playbackRate,
    duration_seconds_input: input.durationSeconds,
    increment_state_version_input: input.incrementStateVersion ?? true
  });
  if (error) throw error;
  return data;
}

export async function getRoomPlaybackSnapshot(roomId: string): Promise<RoomPlaybackState | null> {
  const { data, error } = await playbackRpc("get_room_playback_snapshot", { room_id_input: roomId });
  if (error) throw error;
  return data;
}
