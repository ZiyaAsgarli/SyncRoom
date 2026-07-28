import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/202607280001_owner_managed_guest_access.sql"), "utf8");
const service = readFileSync(resolve(process.cwd(), "src/services/guestAccessService.ts"), "utf8");
const joinPage = readFileSync(resolve(process.cwd(), "src/pages/JoinRoomPage.tsx"), "utf8");

describe("owner-managed access architecture", () => {
  it("retains existing guests and adds active, creator, normalized email, and one-owner safeguards", () => {
    expect(migration).toContain("add column if not exists is_active boolean not null default true");
    expect(migration).toContain("add column if not exists created_by uuid");
    expect(migration).toContain("allowed_users_single_owner_idx");
    expect(migration).toContain("where private_role = 'owner'");
    expect(migration).toContain('internal guest role');
    expect(migration).toContain("lower(btrim(email))");
    expect(migration).not.toMatch(/delete\s+from\s+public\.allowed_users/i);
  });

  it("keeps whitelist writes behind owner-only RPCs with no role promotion input", () => {
    expect(migration.match(/if not public\.is_private_owner\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("create or replace function public.add_allowed_guest(email_input text)");
    expect(migration).toContain("create or replace function public.set_allowed_guest_active(email_input text, active_input boolean)");
    expect(migration).not.toMatch(/add_allowed_guest\([^)]*role/i);
    expect(migration).toContain("revoke all on public.allowed_users from anon, authenticated");
    expect(service).not.toContain('.from("allowed_users")');
    expect(service.match(/guestAccessRpc\(/g)?.length).toBe(3);
  });

  it("denies unknown and inactive users through the shared access predicate", () => {
    expect(migration).toMatch(/function public\.is_allowed_user[\s\S]*au\.is_active/);
    expect(migration).toContain("Your access to this private SyncRoom has been removed");
    expect(migration).toContain("This Google account is not invited to SyncRoom");
  });

  it("keeps rooms owner-hosted and atomically limited to two active members", () => {
    expect(migration).toMatch(/function public\.create_private_room[\s\S]*is_private_owner/);
    expect(migration).toMatch(/function public\.join_private_room[\s\S]*for update/);
    expect(migration).toContain("host_role <> 'owner' or profile_row.private_role <> 'friend'");
    expect(migration).toContain("if active_count >= 2");
  });

  it("limits profile and room visibility to relevant memberships and scopes invite preview", () => {
    expect(migration).toContain("public.can_view_profile(user_id)");
    expect(migration).toContain("public.is_room_member(id)");
    expect(migration).toContain("public.is_room_member(room_id)");
    expect(migration).toContain("create or replace function public.get_private_room_invite");
    expect(joinPage).toContain("getPrivateRoomInvite(cleanCode)");
    expect(joinPage).not.toContain("getRoomMembers(room.id)");
  });
});
