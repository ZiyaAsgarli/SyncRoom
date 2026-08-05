import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stageSource = readFileSync(resolve(process.cwd(), "src/components/room/YouTubeWatchStage.tsx"), "utf8");
const bootstrapSource = readFileSync(resolve(process.cwd(), "src/hooks/useDriveSilentBootstrap.ts"), "utf8");
const authSource = readFileSync(resolve(process.cwd(), "src/services/driveAuth.ts"), "utf8");
const playbackSyncSource = readFileSync(resolve(process.cwd(), "src/utils/playbackSync.ts"), "utf8");

describe("Drive restoration and relative seek architecture", () => {
  it("silently restores the persisted room source without Picker or direct media attachment", () => {
    expect(stageSource).toContain("useDriveSilentBootstrap(activeDriveSource, currentProfile.email, driveAuth)");
    expect(bootstrapSource).toContain("silent: true");
    expect(bootstrapSource).toContain("forceRefresh: true");
    expect(bootstrapSource).not.toContain("pickDriveVideo");
    expect(bootstrapSource).not.toContain("bindDriveMediaSession");
    expect(bootstrapSource).not.toContain("driveMediaUrl");
  });

  it("shows Connect only after silent interaction is required", () => {
    expect(stageSource).toContain("shouldShowDriveConnect(driveBootstrap, driveAuth.reconnectRequired)");
    expect(authSource).toContain('prompt: options.silent ? "none"');
    expect(authSource).toContain("login_hint");
  });

  it("keeps tokens memory-only during bootstrap and renewal", () => {
    for (const persistenceApi of ["localStorage", "sessionStorage", "indexedDB", "document.cookie"]) {
      expect(authSource).not.toContain(persistenceApi);
      expect(bootstrapSource).not.toContain(persistenceApi);
    }
  });

  it("renders host-only rewind and forward controls through one authoritative seek path", () => {
    expect(stageSource).toContain('aria-label="Rewind synchronized video 10 seconds"');
    expect(stageSource).toContain('aria-label="Forward synchronized video 10 seconds"');
    expect(stageSource).toContain("issueHostRelativeSeek(-10)");
    expect(stageSource).toContain("issueHostRelativeSeek(10)");
    expect(stageSource).toContain("issueRelativeAuthoritativeSeek({");
    expect(stageSource).toContain("commitSeek: commitHostSeek");
    expect(stageSource).toContain('hostCommand("playback:seek"');
    expect(playbackSyncSource).toContain("if (!input.isHost) return false");
    expect(stageSource.match(/\{isHost \? \(/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("prevents seek controls from toggling the video surface click action", () => {
    const relativeSeekButtons = stageSource.slice(stageSource.indexOf('aria-label="Rewind synchronized video 10 seconds"') - 500, stageSource.indexOf('aria-label="Forward synchronized video 10 seconds"') + 100);
    expect(relativeSeekButtons.match(/event\.stopPropagation\(\)/g)).toHaveLength(3);
    expect(relativeSeekButtons).not.toContain("cancelSingleClick()");
  });
});
