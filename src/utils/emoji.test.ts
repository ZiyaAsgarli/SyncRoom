import { describe, expect, it } from "vitest";
import { insertAtCursor } from "./emoji";

describe("emoji insertion", () => {
  it("inserts at the cursor and preserves surrounding text", () => {
    expect(insertAtCursor("movie night", "🍿", 6)).toEqual({ value: "movie 🍿night", cursor: 8 });
  });

  it("replaces selected text", () => {
    expect(insertAtCursor("so good", "🔥", 3, 7)).toEqual({ value: "so 🔥", cursor: 5 });
  });
});
