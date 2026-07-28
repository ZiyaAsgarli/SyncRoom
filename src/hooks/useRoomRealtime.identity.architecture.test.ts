import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/hooks/useRoomRealtime.ts"), "utf8");

describe("room realtime identity hydration", () => {
  it("updates the member ref before storing member state", () => {
    const applyMembers = source.slice(source.indexOf("const applyMembers"), source.indexOf("const pushLiveFlowMessage"));
    expect(applyMembers.indexOf("membersRef.current = nextMembers"))
      .toBeLessThan(applyMembers.indexOf("setMembers(nextMembers)"));
  });

  it("repairs chat and flowing messages when member profiles arrive", () => {
    expect(source).toContain("setMessages((current) => hydrateMessageProfiles(current, nextMembers");
    expect(source).toContain("setLiveFlowMessages((current) => hydrateMessageProfiles(current, nextMembers");
    expect(source).toContain("resolveMessageProfile(message, membersRef.current, currentProfileRef.current)");
  });

  it("merges initial history without overwriting a realtime insert that arrived first", () => {
    expect(source).toContain("nextMessages.reduce((merged, message) => mergeConfirmedMessage(merged, message), current)");
  });
});
