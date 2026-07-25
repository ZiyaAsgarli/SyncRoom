import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const driveAuth = readFileSync(resolve(process.cwd(), "src/services/driveAuth.ts"), "utf8");
const driveServiceWorkerClient = readFileSync(resolve(process.cwd(), "src/services/driveServiceWorker.ts"), "utf8");
const driveServiceWorker = readFileSync(resolve(process.cwd(), "public/syncroom-drive-sw.js"), "utf8");
const playbackService = readFileSync(resolve(process.cwd(), "src/services/playbackService.ts"), "utf8");

describe("Drive privacy architecture", () => {
  it("keeps Drive OAuth tokens out of persistent browser storage and media URLs", () => {
    expect(driveAuth).not.toContain("localStorage");
    expect(driveAuth).not.toContain("sessionStorage");
    expect(driveAuth).not.toContain("indexedDB");
    expect(driveServiceWorkerClient).not.toContain("access_token");
    expect(driveServiceWorker).not.toContain("access_token");
  });

  it("only sends safe Drive metadata to Supabase playback RPCs", () => {
    expect(playbackService).toContain("set_room_drive_source");
    expect(playbackService).not.toContain("accessToken");
    expect(playbackService).not.toContain("Authorization");
    expect(playbackService).not.toContain("webContentLink");
  });
});
