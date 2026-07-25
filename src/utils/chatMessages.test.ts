import { describe, expect, it } from "vitest";
import type { Message } from "../types/database";
import { mergeConfirmedMessage, parseMessageInsertPayload, shouldFlowLiveMessage } from "./chatMessages";

const baseMessage: Message = {
  id: "message-1",
  room_id: "room-1",
  user_id: "user-1",
  body: "hello",
  created_at: "2026-07-21T10:00:00.000Z"
};

describe("realtime chat message helpers", () => {
  it("parses INSERT payloads only for the current room", () => {
    const payload = { new: baseMessage } as never;
    expect(parseMessageInsertPayload(payload, "room-1")?.id).toBe("message-1");
    expect(parseMessageInsertPayload(payload, "other-room")).toBeNull();
  });

  it("replaces a matching optimistic message with the database message", () => {
    const optimistic: Message = { ...baseMessage, id: "optimistic-abc", created_at: "2026-07-21T09:59:59.000Z" };
    const merged = mergeConfirmedMessage([optimistic], baseMessage);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("message-1");
  });

  it("does not duplicate confirmed messages", () => {
    expect(mergeConfirmedMessage([baseMessage], baseMessage)).toHaveLength(1);
  });

  it("does not flow historical baseline messages", () => {
    expect(shouldFlowLiveMessage(baseMessage, new Set(["message-1"]), true)).toBe(false);
  });

  it("flows live messages only after the subscription is ready", () => {
    expect(shouldFlowLiveMessage(baseMessage, new Set(), false)).toBe(false);
    expect(shouldFlowLiveMessage(baseMessage, new Set(), true)).toBe(true);
  });
});
