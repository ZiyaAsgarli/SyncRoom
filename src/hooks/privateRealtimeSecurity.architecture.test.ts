import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const playbackHook = readFileSync(resolve(process.cwd(), "src/hooks/usePlaybackRoomChannel.ts"), "utf8");
const roomHook = readFileSync(resolve(process.cwd(), "src/hooks/useRoomRealtime.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/202608070001_private_room_realtime_authorization.sql"), "utf8");

describe("private room Realtime architecture", () => {
  it("uses authenticated private channels for playback, participant events, and presence", () => {
    expect(playbackHook).toContain('room:${roomId}:playback`');
    expect(playbackHook).toContain('room:${roomId}:participant`');
    expect(playbackHook.match(/private: true/g)).toHaveLength(2);
    expect(roomHook).toContain("private: true");
    expect(playbackHook).toContain("supabase.realtime.setAuth()");
    expect(roomHook).toContain("supabase.realtime.setAuth()");
  });

  it("enforces member receive/send access and host-only authoritative sends in SQL", () => {
    expect(migration).toContain("on realtime.messages");
    expect(migration).toContain("public.is_active_room_member");
    expect(migration).toContain("public.is_room_host");
    expect(migration).toContain("r.status <> 'ended'");
    expect(migration).toContain("for select");
    expect(migration).toContain("for insert");
  });
});
