import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Message, Profile, Room, RoomMember } from "../../types/database";
import { ChatPanel } from "./ChatPanel";

const room: Room = {
  id: "room-1",
  invite_code: "ABC1234",
  room_name: "Private room",
  host_user_id: "owner-1",
  status: "active",
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
  ended_at: null
};

const owner: Profile = {
  user_id: "owner-1",
  email: "owner@example.test",
  full_name: "Owner Name",
  avatar_url: null,
  private_role: "owner",
  created_at: "",
  updated_at: ""
};

const guest: Profile = { ...owner, user_id: "guest-1", email: "guest@example.test", full_name: "Guest Name", private_role: "friend" };

const members: RoomMember[] = [
  { room_id: room.id, user_id: owner.user_id, member_role: "host", joined_at: "", left_at: null, profiles: owner },
  { room_id: room.id, user_id: guest.user_id, member_role: "guest", joined_at: "", left_at: null, profiles: guest }
];

function renderChat(currentProfile: Profile, sender: Profile) {
  const messages: Message[] = [{
    id: `message-${sender.user_id}`,
    room_id: room.id,
    user_id: sender.user_id,
    body: "Identity check",
    created_at: "2026-07-28T10:00:00.000Z"
  }];
  return render(
    <ChatPanel
      room={room}
      messages={messages}
      members={members}
      currentProfile={currentProfile}
      flowingEnabled
      onFlowingChange={vi.fn()}
      onSend={vi.fn()}
    />
  );
}

describe("ChatPanel sender identity", () => {
  it("shows the guest name to the owner even when the message payload has no embedded profile", () => {
    renderChat(owner, guest);
    expect(screen.getByText("Guest Name")).toBeInTheDocument();
    expect(screen.queryByText("Private user")).not.toBeInTheDocument();
  });

  it("shows the owner name to the guest even when the message payload has no embedded profile", () => {
    renderChat(guest, owner);
    expect(screen.getByText("Owner Name")).toBeInTheDocument();
    expect(screen.queryByText("Private user")).not.toBeInTheDocument();
  });
});
