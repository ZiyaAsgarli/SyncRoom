import { describe, expect, it } from "vitest";
import type { Message, Profile, RoomMember } from "../types/database";
import { hydrateMessageProfiles, messageSenderName, resolveMessageProfile } from "./chatMessages";

const owner: Profile = {
  user_id: "owner-1",
  email: "owner@example.test",
  full_name: "Owner Name",
  avatar_url: null,
  private_role: "owner",
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z"
};

const guest: Profile = {
  ...owner,
  user_id: "guest-1",
  email: "guest@example.test",
  full_name: "Guest Name",
  private_role: "friend"
};

const members: RoomMember[] = [
  { room_id: "room-1", user_id: owner.user_id, member_role: "host", joined_at: "", left_at: null, profiles: owner },
  { room_id: "room-1", user_id: guest.user_id, member_role: "guest", joined_at: "", left_at: null, profiles: guest }
];

function message(userId: string): Message {
  return { id: `message-${userId}`, room_id: "room-1", user_id: userId, body: "Hello", created_at: "2026-07-28T10:00:00.000Z" };
}

describe("message sender identity", () => {
  it("resolves the guest display name for the owner from hydrated membership", () => {
    const profile = resolveMessageProfile(message(guest.user_id), members, owner);
    expect(messageSenderName(profile)).toBe("Guest Name");
  });

  it("resolves the owner display name for the guest from hydrated membership", () => {
    const profile = resolveMessageProfile(message(owner.user_id), members, guest);
    expect(messageSenderName(profile)).toBe("Owner Name");
  });

  it("repairs a previously unresolved realtime message when members arrive", () => {
    const unresolved = message(guest.user_id);
    const [hydrated] = hydrateMessageProfiles([unresolved], members, owner);
    expect(hydrated.profiles).toEqual(guest);
    expect(messageSenderName(hydrated.profiles)).toBe("Guest Name");
  });

  it("uses the fallback only when no valid display name is available", () => {
    expect(messageSenderName({ ...guest, full_name: "   " })).toBe("Private user");
    expect(messageSenderName(undefined)).toBe("Private user");
    expect(messageSenderName(guest)).toBe("Guest Name");
  });
});
