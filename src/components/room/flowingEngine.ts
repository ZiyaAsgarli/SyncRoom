export interface FlowingMessageInput {
  id: string;
  createdAtMs: number;
}

export interface LaneAssignment {
  id: string;
  lane: number;
  startsAtMs: number;
}

export function assignFlowingLane(
  message: FlowingMessageInput,
  laneAvailableAt: number[],
  options: { maxLanes: number; travelMs: number; minGapMs: number }
): LaneAssignment {
  const lanes = laneAvailableAt.slice(0, options.maxLanes);
  while (lanes.length < options.maxLanes) lanes.push(0);

  let lane = 0;
  let earliest = lanes[0] ?? 0;
  for (let index = 1; index < lanes.length; index += 1) {
    if (lanes[index] < earliest) {
      earliest = lanes[index];
      lane = index;
    }
  }

  const startsAtMs = Math.max(message.createdAtMs, earliest);
  laneAvailableAt[lane] = startsAtMs + options.minGapMs;
  return { id: message.id, lane, startsAtMs };
}

export function maxLanesForWidth(width: number): number {
  if (width < 640) return 3;
  if (width < 1024) return 4;
  return 5;
}
