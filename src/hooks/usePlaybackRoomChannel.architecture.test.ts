import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/hooks/usePlaybackRoomChannel.ts"), "utf8");

describe("playback room channel architecture", () => {
  it("does not own a periodic heartbeat interval with playback snapshots", () => {
    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("snapshot.current_time_seconds");
  });

  it("loads the database snapshot only on channel setup", () => {
    expect(source.match(/getRoomPlaybackSnapshot/g)?.length).toBe(2);
  });
});
