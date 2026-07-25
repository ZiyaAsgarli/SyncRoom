import { describe, expect, it } from "vitest";
import { assignFlowingLane, maxLanesForWidth } from "./flowingEngine";

describe("flowing message lane scheduler", () => {
  it("uses the earliest available lane", () => {
    const lanes = [0, 5000, 3000];
    const assignment = assignFlowingLane({ id: "m1", createdAtMs: 1000 }, lanes, { maxLanes: 3, travelMs: 8000, minGapMs: 1600 });
    expect(assignment.lane).toBe(0);
    expect(assignment.startsAtMs).toBe(1000);
  });

  it("queues when every lane is occupied", () => {
    const lanes = [4000, 2000];
    const assignment = assignFlowingLane({ id: "m2", createdAtMs: 1000 }, lanes, { maxLanes: 2, travelMs: 8000, minGapMs: 1600 });
    expect(assignment.lane).toBe(1);
    expect(assignment.startsAtMs).toBe(2000);
  });

  it("caps mobile and desktop lane counts", () => {
    expect(maxLanesForWidth(390)).toBe(3);
    expect(maxLanesForWidth(800)).toBe(4);
    expect(maxLanesForWidth(1280)).toBe(5);
  });
});
