import { describe, expect, it } from "vitest";
import { userFacingError } from "./userFacingError";

describe("userFacingError", () => {
  it("preserves known actionable product messages", () => {
    expect(userFacingError({ message: "This room is already full" }, "Could not join.")).toBe("This room is already full");
  });

  it("does not expose unknown database or network exception details", () => {
    expect(userFacingError({ message: "relation private_table does not exist" }, "Could not load.")).toBe("Could not load.");
    expect(userFacingError({ message: "Bearer secret-value" }, "Could not load.")).toBe("Could not load.");
  });
});
