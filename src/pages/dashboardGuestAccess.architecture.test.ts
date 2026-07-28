import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(resolve(process.cwd(), "src/pages/DashboardPage.tsx"), "utf8");
const panel = readFileSync(resolve(process.cwd(), "src/components/access/GuestAccessPanel.tsx"), "utf8");

describe("dashboard guest access", () => {
  it("renders management and room creation only for the owner role", () => {
    expect(dashboard).toContain("canManageGuestAccess");
    expect(dashboard).toContain("{isOwner ? <GuestAccessPanel");
    expect(dashboard).toContain("{isOwner ? <Button");
    expect(dashboard).not.toContain("getAllowedProfiles");
  });

  it("keeps the owner UI compact and responsive for long guest emails", () => {
    expect(panel).toContain("break-all text-sm font-medium sm:truncate");
    expect(panel).toContain("w-full sm:w-auto");
    expect(panel).toContain('aria-label={`${guest.is_active ? "Remove" : "Restore"} access for ${guest.email}`}');
    expect(panel).toContain("maxLength={254}");
  });
});
