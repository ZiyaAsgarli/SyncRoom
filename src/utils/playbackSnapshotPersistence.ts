export const SNAPSHOT_FAILURE_LIMIT = 3;
export const SNAPSHOT_CIRCUIT_BREAKER_MS = 30_000;
export const SNAPSHOT_SAFE_WRITE_LIMIT_PER_MINUTE = 10;

export interface SnapshotPersistenceState {
  inFlight: boolean;
  consecutiveFailures: number;
  suspendedUntilMs: number;
  writeTimestampsMs: number[];
}

export type SnapshotSkipReason = "not-host" | "no-source" | "not-playing" | "in-flight" | "circuit-open" | null;

export function createSnapshotPersistenceState(): SnapshotPersistenceState {
  return {
    inFlight: false,
    consecutiveFailures: 0,
    suspendedUntilMs: 0,
    writeTimestampsMs: []
  };
}

export function shouldSkipSnapshotPersistence(input: {
  state: SnapshotPersistenceState;
  isHost: boolean;
  hasSource: boolean;
  isPlaying: boolean;
  nowMs: number;
}): SnapshotSkipReason {
  if (!input.isHost) return "not-host";
  if (!input.hasSource) return "no-source";
  if (!input.isPlaying) return "not-playing";
  if (input.state.inFlight) return "in-flight";
  if (input.nowMs < input.state.suspendedUntilMs) return "circuit-open";
  return null;
}

export function markSnapshotWriteStarted(state: SnapshotPersistenceState, nowMs: number): SnapshotPersistenceState {
  return {
    ...state,
    inFlight: true,
    writeTimestampsMs: state.writeTimestampsMs
      .filter((timestamp) => nowMs - timestamp < 60_000)
      .concat(nowMs)
  };
}

export function markSnapshotWriteSucceeded(state: SnapshotPersistenceState): SnapshotPersistenceState {
  return {
    ...state,
    inFlight: false,
    consecutiveFailures: 0,
    suspendedUntilMs: 0
  };
}

export function markSnapshotWriteFailed(state: SnapshotPersistenceState, nowMs: number): SnapshotPersistenceState {
  const consecutiveFailures = state.consecutiveFailures + 1;
  return {
    ...state,
    inFlight: false,
    consecutiveFailures,
    suspendedUntilMs: consecutiveFailures >= SNAPSHOT_FAILURE_LIMIT ? nowMs + SNAPSHOT_CIRCUIT_BREAKER_MS : state.suspendedUntilMs
  };
}

export function didExceedSafeSnapshotWriteRate(state: SnapshotPersistenceState, nowMs: number): boolean {
  return state.writeTimestampsMs.filter((timestamp) => nowMs - timestamp < 60_000).length > SNAPSHOT_SAFE_WRITE_LIMIT_PER_MINUTE;
}
