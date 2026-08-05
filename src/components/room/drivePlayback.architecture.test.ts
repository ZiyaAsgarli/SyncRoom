import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stageSource = readFileSync(resolve(process.cwd(), "src/components/room/YouTubeWatchStage.tsx"), "utf8");
const flowingSource = readFileSync(resolve(process.cwd(), "src/components/room/FlowingMessages.tsx"), "utf8");
const serviceWorkerClientSource = readFileSync(resolve(process.cwd(), "src/services/driveServiceWorker.ts"), "utf8");

describe("Drive cinema playback architecture", () => {
  it("removes the permanent technical toolbar", () => {
    expect(stageSource).not.toContain("In sync · Google Drive");
    expect(stageSource).not.toContain("Waiting for friend readiness");
    expect(stageSource).not.toContain(">10s<");
    expect(stageSource).not.toContain(">1.25x<");
    expect(stageSource).not.toContain("Toggle cinema mode");
  });

  it("keeps Play and Pause on the explicit authoritative control only", () => {
    const surfaceClick = stageSource.slice(stageSource.indexOf("function handleVideoSurfaceClick"), stageSource.indexOf("function handleVideoSurfaceDoubleClick"));
    expect(surfaceClick).toContain("showControls()");
    expect(surfaceClick).not.toContain("issueHostPlay");
    expect(surfaceClick).not.toContain("issueHostPause");
    expect(stageSource).toContain("void (isLocalPlaying ? issueHostPause() : issueHostPlay())");
    expect(stageSource).toContain('hostCommand("playback:play", "playing")');
    expect(stageSource).toContain('hostCommand("playback:pause", "paused")');
  });

  it("keeps guest interactions local and hides authoritative controls", () => {
    expect(stageSource).toContain("<ReadOnlyPlaybackProgress");
    expect(stageSource).toContain("{isHost ? (");
    expect(stageSource).toContain('aria-label="Local volume"');
    expect(stageSource).toContain('aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}');
  });

  it("fullscreens only the player stage and tracks browser fullscreen changes", () => {
    expect(stageSource).toContain("ref={playerStageRef}");
    expect(stageSource).toContain("toggleElementFullscreen(target, document.fullscreenElement");
    expect(stageSource).toContain('document.addEventListener("fullscreenchange"');
    expect(stageSource).not.toContain("document.documentElement.requestFullscreen");
  });

  it("keeps double-click fullscreen independent from Play/Pause", () => {
    expect(stageSource).toContain("handleVideoSurfaceDoubleClick");
    expect(stageSource).toContain("void togglePlayerFullscreen()");
    expect(stageSource).not.toContain("cancelSingleClick()");
  });

  it("keeps flowing messages in the fullscreen player stacking layer", () => {
    expect(stageSource.indexOf("ref={playerStageRef}")).toBeLessThan(stageSource.indexOf("<FlowingMessages"));
    expect(flowingSource).toContain("z-20");
  });

  it("preserves Drive session rebinding without token persistence", () => {
    expect(serviceWorkerClientSource).toContain("rebindDriveMediaSession");
    expect(serviceWorkerClientSource).not.toContain("localStorage");
    expect(serviceWorkerClientSource).not.toContain("sessionStorage");
    expect(serviceWorkerClientSource).not.toContain("indexedDB");
  });
});
