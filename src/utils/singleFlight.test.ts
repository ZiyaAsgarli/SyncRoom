import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "./singleFlight";

describe("single flight action", () => {
  it("reuses the same in-flight action", async () => {
    const action = vi.fn(async () => "done");
    const singleFlight = createSingleFlight(action);
    const [first, second] = await Promise.all([singleFlight(), singleFlight()]);
    expect(first).toBe("done");
    expect(second).toBe("done");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("allows a later action after the first finishes", async () => {
    const action = vi.fn(async () => "done");
    const singleFlight = createSingleFlight(action);
    await singleFlight();
    await singleFlight();
    expect(action).toHaveBeenCalledTimes(2);
  });
});
