import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stageSource = readFileSync(resolve(process.cwd(), "src/components/room/YouTubeWatchStage.tsx"), "utf8");
const lifecycleSource = readFileSync(resolve(process.cwd(), "src/hooks/useDriveMediaLifecycle.ts"), "utf8");
const playerSource = readFileSync(resolve(process.cwd(), "src/hooks/useDriveVideoPlayer.ts"), "utf8");
const channelSource = readFileSync(resolve(process.cwd(), "src/hooks/usePlaybackRoomChannel.ts"), "utf8");
const workerClientSource = readFileSync(resolve(process.cwd(), "src/services/driveServiceWorker.ts"), "utf8");
const workerSource = readFileSync(resolve(process.cwd(), "public/syncroom-drive-sw.js"), "utf8");

describe("Drive media reliability architecture", () => {
  it("centralizes bind, clear, src, and recovery ownership", () => {
    expect(stageSource).not.toContain("bindDriveMediaSession");
    expect(stageSource).not.toContain("clearDriveMediaSession");
    expect(stageSource).not.toContain("driveMediaUrl");
    expect(lifecycleSource).toContain("bindDriveMediaSession");
    expect(lifecycleSource).toContain("clearDriveMediaSession");
    expect(lifecycleSource).toContain("driveMediaUrl");
    expect(stageSource).toContain("driveLifecycle.recover(error, manual)");
  });

  it("does not destructively reset the video during effect cleanup", () => {
    expect(playerSource).not.toContain('removeAttribute("src")');
    expect(playerSource).not.toContain("video.pause()");
    expect(playerSource.match(/\.load\(\)/g)).toHaveLength(1);
    expect(playerSource).toContain("const reload = useCallback");
  });

  it("keeps normal UI, readiness, and playback events out of Drive binding dependencies", () => {
    for (const unrelated of ["flowMessages", "controlsVisible", "isFullscreen", "otherReady", "heartbeat", "snapshotPersist"]) {
      expect(lifecycleSource).not.toContain(unrelated);
    }
    expect(channelSource).not.toContain("bindDriveMediaSession");
    expect(channelSource).not.toContain("clearDriveMediaSession");
  });

  it("keeps one unkeyed video element whose src comes only from ACK-gated lifecycle state", () => {
    expect(stageSource).toContain("src={driveLifecycle.mediaSrc}");
    expect(stageSource).not.toMatch(/<video[^>]*key=/s);
    expect(lifecycleSource.indexOf("await bindDriveMediaSession")).toBeLessThan(lifecycleSource.indexOf("driveMediaUrl(activeSource.fileId, generation)"));
  });

  it("uses generation-owned atomic worker messages and matching ACKs", () => {
    expect(workerClientSource).toContain('type: "BIND_DRIVE_MEDIA_SESSION"');
    expect(workerClientSource).toContain('ack.type !== "DRIVE_MEDIA_SESSION_BOUND"');
    expect(workerClientSource).toContain("expectedGeneration");
    expect(workerSource).toContain('type: "DRIVE_MEDIA_SESSION_BOUND"');
    expect(workerSource).toContain("mediaSession.generation === expectedGeneration");
    expect(workerSource).not.toContain("DRIVE_TOKEN_CLEAR");
  });

  it("does not reset src or call load during token refresh and controller rebind", () => {
    const rebindBody = workerClientSource.slice(workerClientSource.indexOf("export async function rebindDriveMediaSession"), workerClientSource.indexOf("export function getBoundDriveMediaSession"));
    expect(rebindBody).not.toContain("driveMediaUrl");
    expect(rebindBody).not.toContain(".load(");
    expect(rebindBody).not.toContain("clearDriveMediaSession");
  });

  it("uses deterministic gateway errors instead of false codec payloads", () => {
    expect(workerSource).toContain('gatewayError(428, "DRIVE_SESSION_NOT_BOUND")');
    expect(workerSource).toContain('gatewayError(401, "DRIVE_AUTH_REQUIRED")');
    expect(workerSource).toContain('gatewayError(403, "DRIVE_ACCESS_DENIED")');
    expect(playerSource).not.toContain("could not be decoded");
  });
});
