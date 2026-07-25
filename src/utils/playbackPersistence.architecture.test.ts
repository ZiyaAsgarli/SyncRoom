import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const roomStage = readFileSync(resolve(process.cwd(), "src/components/room/YouTubeWatchStage.tsx"), "utf8");
const playbackHook = readFileSync(resolve(process.cwd(), "src/hooks/usePlaybackRoomChannel.ts"), "utf8");
const playbackService = readFileSync(resolve(process.cwd(), "src/services/playbackService.ts"), "utf8");
const latestMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/202607240001_playback_snapshot_concurrency_fix.sql"), "utf8");

describe("playback persistence architecture", () => {
  it("keeps update_room_playback_state behind the playback service only", () => {
    expect(playbackService.match(/update_room_playback_state/g)?.length).toBe(2);
    expect(playbackHook).toContain("updateRoomPlaybackState");
    expect(roomStage).not.toContain("updateRoomPlaybackState");
  });

  it("keeps heartbeat broadcast-only and separate from snapshot persistence", () => {
    const heartbeatBlock = roomStage.slice(roomStage.indexOf("heartbeat timer created"), roomStage.indexOf("snapshot timer created"));
    expect(heartbeatBlock).toContain("broadcastPlaybackEvent");
    expect(heartbeatBlock).not.toContain("persistAndBroadcast");
    expect(heartbeatBlock).not.toContain("persistPlaybackSnapshot");
    expect(heartbeatBlock).not.toContain("updateRoomPlaybackState");
  });

  it("has exactly one periodic database snapshot owner in the room stage", () => {
    expect(roomStage.match(/snapshot timer created/g)?.length).toBe(1);
    expect(roomStage.match(/PLAYBACK_TIMING\.snapshotPersistMs/g)?.length).toBe(1);
    expect(playbackHook).not.toContain("setInterval");
  });

  it("does not persist from player currentTime or timeupdate handlers", () => {
    expect(roomStage).not.toContain("timeupdate");
    expect(roomStage).not.toContain("timeUpdate");
  });

  it("periodic snapshots do not increment authoritative state version", () => {
    expect(playbackHook).toContain("incrementStateVersion: false");
    expect(latestMigration).toContain("increment_state_version_input boolean default true");
    expect(latestMigration).toContain("when increment_state_version_input then state_version + 1");
    expect(latestMigration).toContain("else state_version");
  });

  it("stale snapshot conflicts return the latest row without SQLSTATE 40001", () => {
    expect(latestMigration).toContain("Return the latest row as a no-op");
    expect(latestMigration).not.toContain("40001");
    expect(latestMigration).not.toContain("Stale playback state version");
  });
});
