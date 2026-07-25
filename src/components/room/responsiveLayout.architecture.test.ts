import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const roomSource = readFileSync(resolve(process.cwd(), "src/pages/RoomPage.tsx"), "utf8");
const chatSource = readFileSync(resolve(process.cwd(), "src/components/chat/ChatPanel.tsx"), "utf8");
const stageSource = readFileSync(resolve(process.cwd(), "src/components/room/YouTubeWatchStage.tsx"), "utf8");
const presenceSource = readFileSync(resolve(process.cwd(), "src/components/room/PresenceList.tsx"), "utf8");
const dashboardSource = readFileSync(resolve(process.cwd(), "src/pages/DashboardPage.tsx"), "utf8");
const loginSource = readFileSync(resolve(process.cwd(), "src/pages/LoginPage.tsx"), "utf8");
const dialogSource = readFileSync(resolve(process.cwd(), "src/components/ui/Dialog.tsx"), "utf8");
const stylesSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("responsive product layout architecture", () => {
  it("keeps phones and tablets watch-first until a wide desktop breakpoint", () => {
    expect(roomSource).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(20rem,23rem)]");
    expect(roomSource).toContain("xl:hidden");
    expect(roomSource).not.toContain("lg:flex-row");
    expect(chatSource).toContain("xl:static");
    expect(chatSource).toContain("(min-width: 1280px)");
  });

  it("uses a real hidden mobile chat drawer with independent scrolling and keyboard-safe sizing", () => {
    expect(chatSource).toContain("translate-y-full");
    expect(chatSource).not.toContain("translate-y-[calc(100%-4.75rem)]");
    expect(chatSource).toContain("h-[min(88dvh,48rem)]");
    expect(chatSource).toContain("overscroll-contain");
    expect(chatSource).toContain('document.body.style.overflow = "hidden"');
    expect(chatSource).toContain('panel.setAttribute("inert", "")');
    expect(chatSource).toContain('event.key === "Escape"');
  });

  it("separates content-height setup states from the active 16:9 player", () => {
    expect(stageSource).toContain("needsSetupFrame");
    expect(stageSource).toContain("min-h-[24rem]");
    expect(stageSource).toContain("sm:aspect-video");
    expect(stageSource).toContain('data-media-active={activeSource ? "true" : "false"}');
    expect(stageSource).toContain("h-dvh w-screen");
    expect(stageSource).not.toMatch(/<video[^>]*key=/s);
  });

  it("keeps source entry and player controls touch-friendly without granting guest authority", () => {
    expect(stageSource).toContain("grid-cols-2 gap-2 sm:contents");
    expect(stageSource).toContain("min-h-11 min-w-0");
    expect(stageSource).toContain("h-8 min-w-0 flex-1 touch-pan-y");
    expect(stageSource).toContain('aria-label="Rewind synchronized video 10 seconds"');
    expect(stageSource).toContain('aria-label="Forward synchronized video 10 seconds"');
    expect(stageSource.match(/\{isHost \? \(/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("contains long room, participant, Drive, and message content", () => {
    expect(roomSource).toContain("truncate text-base");
    expect(presenceSource).toContain("min-w-0");
    expect(presenceSource).toContain("truncate font-semibold");
    expect(stageSource).toContain("line-clamp-2 break-words");
    expect(chatSource).toContain("whitespace-pre-wrap break-words");
  });

  it("uses dynamic viewport and safe-area constraints for landscape and overlays", () => {
    expect(stylesSource).toContain("100svh");
    expect(stylesSource).toContain("100dvh");
    expect(stylesSource).toContain('overflow-x: clip');
    expect(roomSource).toContain("env(safe-area-inset-top)");
    expect(dialogSource).toContain("max-h-[calc(100dvh");
  });

  it("keeps dashboard and login single-column and compact on phones", () => {
    expect(dashboardSource).toContain("lg:grid-cols-[1fr_340px]");
    expect(dashboardSource).toContain("w-full sm:w-auto");
    expect(dashboardSource).toContain("px-3 py-5");
    expect(loginSource).toContain("px-4");
    expect(loginSource).toContain("text-2xl");
  });
});
