import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const roomSource = readFileSync(resolve(process.cwd(), "src/pages/RoomPage.tsx"), "utf8");
const chatSource = readFileSync(resolve(process.cwd(), "src/components/chat/ChatPanel.tsx"), "utf8");
const stageSource = readFileSync(resolve(process.cwd(), "src/components/room/YouTubeWatchStage.tsx"), "utf8");
const playerSource = readFileSync(resolve(process.cwd(), "src/hooks/useYouTubePlayer.ts"), "utf8");
const fullscreenSource = readFileSync(resolve(process.cwd(), "src/utils/fullscreen.ts"), "utf8");

describe("viewport-aware watch experience architecture", () => {
  it("bounds the desktop shell and aligns player and chat in one min-height-safe row", () => {
    expect(roomSource).toContain("xl:max-h-[calc(100dvh-4rem-env(safe-area-inset-top))]");
    expect(roomSource).toContain('data-testid="watch-row"');
    expect(roomSource).toContain("grid min-h-0 min-w-0");
    expect(stageSource).toContain("xl:max-h-[calc(100dvh-10rem-env(safe-area-inset-top))]");
    expect(chatSource).toContain("xl:max-h-[calc(100dvh-10rem-env(safe-area-inset-top))]");
    expect(chatSource).toContain("min-h-0 flex-1");
    expect(chatSource).toContain("overflow-y-auto");
  });

  it("renders mobile chat inline after the player with its composer in normal flow", () => {
    expect(roomSource.indexOf("<YouTubeWatchStage")).toBeLessThan(roomSource.indexOf("<ChatPanel"));
    expect(chatSource).toContain("room-chat-panel");
    expect(chatSource).toContain("flex h-[clamp(20rem,45dvh,34rem)]");
    expect(chatSource).toContain("h-[clamp(20rem,45dvh,34rem)]");
    expect(chatSource).toContain("<form");
    expect(chatSource).not.toContain("fixed inset-x-0 bottom-0");
    expect(chatSource).not.toContain("aria-modal");
    expect(roomSource).not.toContain("Open chat");
  });

  it("does not force YouTube captions and explicitly keeps supported native controls", () => {
    expect(playerSource).toContain("controls: 1");
    expect(playerSource).not.toContain("cc_load_policy");
    expect(playerSource).not.toContain("cc_lang_pref");
  });

  it("keeps caption/settings access local and never recreates the player", () => {
    expect(stageSource).toContain("youTubeControlsModeRef");
    expect(stageSource).toContain('aria-label="Open YouTube captions and settings"');
    expect(stageSource).toContain("activeSource && activeReady && !youTubeControlsMode");
    expect(stageSource).toContain("if (youTubeControlsModeRef.current) return;");
    expect(stageSource.match(/if \(youTubeControlsModeRef\.current\) return;/g)?.length).toBeGreaterThanOrEqual(3);
    expect(stageSource).not.toMatch(/<div ref=\{youTubePlayer\.containerRef\}[^>]*key=/s);
    expect(playerSource).toContain("}, [options.videoId]);");
  });

  it("does not grant guest authority through the local YouTube settings mode", () => {
    const openMode = stageSource.slice(stageSource.indexOf("function openYouTubeControls"), stageSource.indexOf("function closeYouTubeControls"));
    expect(openMode).not.toContain("hostCommand");
    expect(openMode).not.toContain("broadcastPlaybackEvent");
    expect(openMode).not.toContain("persistPlaybackSnapshot");
    const closeMode = stageSource.slice(stageSource.indexOf("function closeYouTubeControls"), stageSource.indexOf("function updateLocalVolume"));
    expect(closeMode).not.toContain("hostCommand");
    expect(closeMode).not.toContain("broadcastPlaybackEvent");
    expect(closeMode).not.toContain("persistPlaybackSnapshot");
    expect(stageSource).toContain("if (!isHost || Date.now() < suppressRemoteUntil.current) return;");
  });

  it("keeps orientation handling local to the fullscreen utility", () => {
    expect(fullscreenSource.indexOf("await target.requestFullscreen()"))
      .toBeLessThan(fullscreenSource.indexOf('await options.orientation.lock("landscape")'));
    expect(fullscreenSource).toContain("unlockScreenOrientation");
    expect(fullscreenSource).not.toContain("broadcast");
    expect(fullscreenSource).not.toContain("persist");
    expect(stageSource).toContain('window.matchMedia("(orientation: portrait) and (max-width: 1180px)")');
  });

  it("preserves host-only transport controls and guest-local controls", () => {
    expect(stageSource).toContain('aria-label="Rewind synchronized video 10 seconds"');
    expect(stageSource).toContain('aria-label="Forward synchronized video 10 seconds"');
    expect(stageSource).toContain('aria-label={localMuted ? "Unmute video" : "Mute video"}');
    expect(stageSource).toContain('aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}');
    expect(stageSource.match(/\{isHost \? \(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
