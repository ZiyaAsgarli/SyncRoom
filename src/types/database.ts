export type PrivateRole = "owner" | "friend";
export type RoomStatus = "waiting" | "active" | "ended";
export type RoomMemberRole = "host" | "guest";
export type SourceType = "youtube" | "google_drive";
export type PlaybackStatus = "idle" | "loading" | "cued" | "playing" | "paused" | "buffering" | "ended" | "error";

export interface Profile {
  user_id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  private_role: PrivateRole;
  created_at: string;
  updated_at: string;
}

export interface AllowedGuest {
  email: string;
  is_active: boolean;
  created_at: string;
}

export interface Room {
  id: string;
  invite_code: string;
  room_name: string;
  host_user_id: string;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  member_role: RoomMemberRole;
  joined_at: string;
  left_at: string | null;
  profiles?: Profile;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: Profile;
}

export interface RoomPlaybackState {
  room_id: string;
  source_type: SourceType;
  youtube_video_id: string | null;
  drive_file_id: string | null;
  drive_file_name: string | null;
  drive_mime_type: string | null;
  drive_file_size: number | null;
  drive_modified_time: string | null;
  playback_status: PlaybackStatus;
  current_time_seconds: number;
  playback_rate: number;
  duration_seconds: number | null;
  state_version: number;
  updated_by: string | null;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      allowed_users: {
        Row: { id: string; email: string; private_role: PrivateRole; is_active: boolean; created_at: string; created_by: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile>; Relationships: [] };
      rooms: { Row: Room; Insert: Partial<Room>; Update: Partial<Room>; Relationships: [] };
      room_members: { Row: RoomMember; Insert: Partial<RoomMember>; Update: Partial<RoomMember>; Relationships: [] };
      messages: { Row: Message; Insert: Pick<Message, "room_id" | "user_id" | "body">; Update: Partial<Message>; Relationships: [] };
      room_playback_states: { Row: RoomPlaybackState; Insert: Partial<RoomPlaybackState>; Update: Partial<RoomPlaybackState>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      sync_private_profile: { Args: never; Returns: Profile };
      check_private_access: { Args: never; Returns: "owner" | "guest" };
      list_allowed_guests: { Args: never; Returns: AllowedGuest[] };
      add_allowed_guest: { Args: { email_input: string }; Returns: AllowedGuest };
      set_allowed_guest_active: { Args: { email_input: string; active_input: boolean }; Returns: AllowedGuest };
      get_private_room_invite: { Args: { invite_code_input: string }; Returns: { room: Room; members: RoomMember[] } | null };
      create_private_room: { Args: { room_name_input?: string | null }; Returns: Room };
      join_private_room: { Args: { invite_code_input: string }; Returns: Room };
      leave_private_room: { Args: { room_id_input: string }; Returns: void };
      end_private_room: { Args: { room_id_input: string }; Returns: void };
      set_room_youtube_source: { Args: { room_id_input: string; youtube_video_id_input: string }; Returns: RoomPlaybackState };
      set_room_drive_source: {
        Args: {
          room_id_input: string;
          drive_file_id_input: string;
          drive_file_name_input: string;
          drive_mime_type_input: string;
          drive_file_size_input?: number | null;
          drive_modified_time_input?: string | null;
        };
        Returns: RoomPlaybackState;
      };
      update_room_playback_state: {
        Args: {
          room_id_input: string;
          expected_state_version: number;
          playback_status_input: PlaybackStatus;
          current_time_seconds_input: number;
          playback_rate_input?: number;
          duration_seconds_input?: number | null;
          increment_state_version_input?: boolean;
        };
        Returns: RoomPlaybackState;
      };
      get_room_playback_snapshot: { Args: { room_id_input: string }; Returns: RoomPlaybackState | null };
    };
    Enums: {
      private_role: PrivateRole;
      room_status: RoomStatus;
      room_member_role: RoomMemberRole;
      playback_status: PlaybackStatus;
      source_type: SourceType;
    };
    CompositeTypes: Record<string, never>;
  };
}
