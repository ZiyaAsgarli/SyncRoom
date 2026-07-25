import { describe, expect, it } from "vitest";
import {
  canAutomaticallyRecoverDriveMedia,
  classifyDriveMediaError,
  createDriveMediaLifecycleState,
  driveMediaErrorMessage,
  nextDriveGeneration,
  transitionDriveLifecycle,
  type DriveMediaSource
} from "./driveMediaLifecycle";

const driveSource: DriveMediaSource = {
  type: "google_drive",
  fileId: "Drive_File-1234567890",
  name: "private.mp4",
  mimeType: "video/mp4",
  size: 4_258_899,
  modifiedTime: "2026-07-25T00:00:00.000Z"
};

describe("Drive media lifecycle state machine", () => {
  it("keeps one generation across 100+ unrelated state updates", () => {
    let state = nextDriveGeneration(createDriveMediaLifecycleState(), driveSource);
    const generation = state.generation;
    const mediaSrc = `/__syncroom_drive_media__/${driveSource.fileId}?generation=${generation}`;
    state = transitionDriveLifecycle(state, generation, { phase: "PLAYABLE", mediaSrc });
    for (let index = 0; index < 150; index += 1) {
      const sameSource = { ...driveSource };
      state = nextDriveGeneration(state, sameSource);
      state = transitionDriveLifecycle(state, generation, { phase: index % 2 === 0 ? "PLAYABLE" : "MEDIA_READY" });
    }
    expect(state.generation).toBe(generation);
    expect(state.mediaSrc).toBe(mediaSrc);
    expect(state.errorCode).toBeNull();
  });

  it("creates a new generation only for a different or re-established source", () => {
    const first = nextDriveGeneration(createDriveMediaLifecycleState(), driveSource);
    const same = nextDriveGeneration(first, { ...driveSource });
    const idle = nextDriveGeneration(same, null);
    const restored = nextDriveGeneration(idle, driveSource);
    expect(same.generation).toBe(first.generation);
    expect(idle.generation).toBeGreaterThan(first.generation);
    expect(restored.generation).toBeGreaterThan(idle.generation);
  });

  it("ignores stale-generation lifecycle results", () => {
    const active = nextDriveGeneration(createDriveMediaLifecycleState(), driveSource);
    const stale = transitionDriveLifecycle(active, active.generation - 1, { phase: "FATAL_MEDIA_ERROR", mediaSrc: "stale" });
    expect(stale).toBe(active);
  });

  it("classifies gateway failures before generic media errors", () => {
    expect(classifyDriveMediaError({ gatewayCode: "DRIVE_SESSION_NOT_BOUND", mediaErrorCode: 4 })).toBe("DRIVE_SESSION_NOT_BOUND");
    expect(classifyDriveMediaError({ gatewayCode: "DRIVE_AUTH_REQUIRED", mediaErrorCode: 4 })).toBe("DRIVE_AUTH_REQUIRED");
    expect(classifyDriveMediaError({ mediaErrorCode: 2 })).toBe("DRIVE_NETWORK_ERROR");
    expect(classifyDriveMediaError({ mediaErrorCode: 4 })).toBe("DRIVE_MEDIA_FORMAT_ERROR");
  });

  it("recovers infrastructure errors but not access or confirmed format failures", () => {
    expect(canAutomaticallyRecoverDriveMedia("DRIVE_SESSION_NOT_BOUND")).toBe(true);
    expect(canAutomaticallyRecoverDriveMedia("DRIVE_NETWORK_ERROR")).toBe(true);
    expect(canAutomaticallyRecoverDriveMedia("DRIVE_ACCESS_DENIED")).toBe(false);
    expect(canAutomaticallyRecoverDriveMedia("DRIVE_MEDIA_FORMAT_ERROR")).toBe(false);
    expect(driveMediaErrorMessage("DRIVE_SESSION_NOT_BOUND")).not.toContain("format");
  });
});
