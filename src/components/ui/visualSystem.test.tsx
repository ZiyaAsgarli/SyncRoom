import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const stage = readFileSync(resolve(process.cwd(), "src/components/room/YouTubeWatchStage.tsx"), "utf8");
const chat = readFileSync(resolve(process.cwd(), "src/components/chat/ChatPanel.tsx"), "utf8");

describe("SyncRoom visual system", () => {
  it("defines the compact Obsidian Sync semantic token set", () => {
    for (const token of [
      "--color-page",
      "--color-surface",
      "--color-surface-elevated",
      "--color-surface-interactive",
      "--color-border",
      "--color-accent",
      "--color-accent-secondary",
      "--color-danger",
      "--color-success",
      "--color-text",
      "--color-text-secondary",
      "--color-text-muted",
      "--color-focus",
      "--shadow-surface",
      "--radius-control",
      "--transition-fast"
    ]) expect(styles).toContain(token);
  });

  it("provides consistent interactive states for every application button variant", () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </>
    );
    expect(screen.getByRole("button", { name: "Primary" })).toHaveClass("bg-[var(--color-accent)]", "focus-visible:outline-[var(--color-focus)]");
    expect(screen.getByRole("button", { name: "Secondary" })).toHaveClass("border-[var(--color-border)]");
    expect(screen.getByRole("button", { name: "Ghost" })).toHaveClass("text-[var(--color-text-secondary)]");
    expect(screen.getByRole("button", { name: "Danger" })).toHaveClass("bg-[#ef7f82]/10");
  });

  it("keeps player controls local, accessible, and visually separate from page buttons", () => {
    expect(styles).toContain(".player-control");
    expect(styles).toContain(".player-control-primary");
    expect(stage).toContain('className="player-control player-control-primary"');
    expect(stage).toContain('aria-label={isLocalPlaying ? "Pause synchronized video" : "Play synchronized video"}');
  });

  it("preserves inline mobile chat and reduced-motion support", () => {
    expect(chat).toContain("room-chat-panel");
    expect(chat).not.toContain("aria-modal");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
