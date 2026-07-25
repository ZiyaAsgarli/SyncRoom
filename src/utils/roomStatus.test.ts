import { describe, expect, it } from "vitest";
import { canJoinRoom, isRoomEnded, roomStatusLabel } from "./roomStatus";

describe("room status utilities", () => {
  it("allows joins only before ended and below capacity", () => {
    expect(canJoinRoom("waiting", 1)).toBe(true);
    expect(canJoinRoom("active", 2)).toBe(false);
    expect(canJoinRoom("ended", 0)).toBe(false);
  });

  it("labels statuses", () => {
    expect(isRoomEnded("ended")).toBe(true);
    expect(roomStatusLabel("waiting")).toBe("Waiting");
  });
});
