import { describe, expect, it } from "vitest";
import type { Room, RoomPlaybackState } from "../types/database";
import { canControlPlayback, shouldResetSource } from "./playbackPermissions";

const room: Room = {
  id: "room",
  invite_code: "ABC1234",
  room_name: "Room",
  host_user_id: "host",
  status: "active",
  created_at: "",
  updated_at: "",
  ended_at: null
};

describe("playback permissions", () => {
  it("allows only the active host to control playback", () => {
    expect(canControlPlayback(room, "host")).toBe(true);
    expect(canControlPlayback(room, "friend")).toBe(false);
    expect(canControlPlayback({ ...room, status: "ended" }, "host")).toBe(false);
  });

  it("detects source replacement", () => {
    expect(shouldResetSource(null, "dQw4w9WgXcQ")).toBe(true);
    expect(shouldResetSource({ youtube_video_id: "dQw4w9WgXcQ" } as RoomPlaybackState, "dQw4w9WgXcQ")).toBe(false);
  });
});
