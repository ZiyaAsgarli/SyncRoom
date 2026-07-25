import { describe, expect, it } from "vitest";
import { isValidDriveFileId, normalizeDriveMetadata, validateGuestSelectedExpectedFile } from "./driveMetadata";

const driveFile = {
  id: "Drive_File-1234567890",
  name: "movie-night.mp4",
  mimeType: "video/mp4",
  size: "1048576",
  modifiedTime: "2026-07-23T12:00:00.000Z",
  capabilities: { canDownload: true }
};

describe("Drive metadata validation", () => {
  it("normalizes safe Drive video metadata without tokens or URLs", () => {
    expect(normalizeDriveMetadata(driveFile)).toMatchObject({
      id: driveFile.id,
      name: "movie-night.mp4",
      mimeType: "video/mp4",
      size: 1048576,
      modifiedTime: driveFile.modifiedTime,
      canDownload: true
    });
  });

  it("rejects unsupported files and non-downloadable videos", () => {
    expect(() => normalizeDriveMetadata({ ...driveFile, mimeType: "video/quicktime" })).toThrow("supported Drive video");
    expect(() => normalizeDriveMetadata({ ...driveFile, capabilities: { canDownload: false } })).toThrow("does not allow");
  });

  it("validates Drive ids and exact guest file matching", () => {
    expect(isValidDriveFileId(driveFile.id)).toBe(true);
    expect(isValidDriveFileId("../bad")).toBe(false);
    expect(() => validateGuestSelectedExpectedFile(driveFile.id, driveFile.id)).not.toThrow();
    expect(() => validateGuestSelectedExpectedFile("Other_File-12345", driveFile.id)).toThrow("exact Drive file");
  });
});
