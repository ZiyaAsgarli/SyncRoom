import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stage = readFileSync(resolve(process.cwd(), "src/components/room/YouTubeWatchStage.tsx"), "utf8");
const readOnlyProgress = readFileSync(resolve(process.cwd(), "src/components/room/ReadOnlyPlaybackProgress.tsx"), "utf8");
const playerChrome = readFileSync(resolve(process.cwd(), "src/hooks/usePlayerChrome.ts"), "utf8");

function functionBlock(name: string, nextName: string): string {
  return stage.slice(stage.indexOf(`function ${name}`), stage.indexOf(`function ${nextName}`));
}

describe("explicit playback controls architecture", () => {
  it("makes surface clicks reveal controls without playback, broadcast, seek, or persistence", () => {
    const clickBlock = functionBlock("handleVideoSurfaceClick", "handleVideoSurfaceDoubleClick");
    expect(clickBlock).toContain("showControls()");
    expect(clickBlock).not.toContain("issueHostPlay");
    expect(clickBlock).not.toContain("issueHostPause");
    expect(clickBlock).not.toContain("hostCommand");
    expect(clickBlock).not.toContain("broadcast");
    expect(clickBlock).not.toContain("seek");
    expect(clickBlock).not.toContain("persist");
  });

  it("keeps double-click local to fullscreen with no delayed single-click machinery", () => {
    const doubleClickBlock = functionBlock("handleVideoSurfaceDoubleClick", "openYouTubeControls");
    expect(doubleClickBlock).toContain("togglePlayerFullscreen");
    expect(doubleClickBlock).not.toContain("issueHostPlay");
    expect(doubleClickBlock).not.toContain("issueHostPause");
    expect(stage).not.toContain("scheduleSingleClick");
    expect(stage).not.toContain("cancelSingleClick");
    expect(playerChrome).not.toContain("SURFACE_SINGLE_CLICK_DELAY_MS");
  });

  it("keeps explicit Play/Pause and host seek on their authoritative paths", () => {
    expect(stage).toContain('aria-label={isLocalPlaying ? "Pause synchronized video" : "Play synchronized video"}');
    expect(stage).toContain("void (isLocalPlaying ? issueHostPause() : issueHostPlay())");
    expect(stage).toContain("issueHostRelativeSeek(-10)");
    expect(stage).toContain("issueHostRelativeSeek(10)");
    expect(stage).toContain("onPointerUp={(event) => commitHostSeek");
  });

  it("renders guest progress inside the fullscreen stage without interactive handlers", () => {
    expect(stage.indexOf("ref={playerStageRef}")).toBeLessThan(stage.indexOf("<ReadOnlyPlaybackProgress"));
    expect(readOnlyProgress).toContain('role="progressbar"');
    expect(readOnlyProgress).not.toContain("onClick");
    expect(readOnlyProgress).not.toContain("onChange");
    expect(readOnlyProgress).not.toContain("onPointer");
    expect(readOnlyProgress).not.toContain("hostCommand");
  });
});
