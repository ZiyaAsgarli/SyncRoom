import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDriveVideoPlayer } from "./useDriveVideoPlayer";

function DrivePlayerHarness({ onTimeChange }: { onTimeChange: (time: { currentTimeSeconds: number; durationSeconds: number | null }) => void }) {
  const player = useDriveVideoPlayer({
    src: "/__syncroom_drive_media__/file-1",
    generation: 1,
    mimeType: "video/mp4",
    onTimeChange
  });
  return <video data-testid="drive-video" ref={player.videoRef} />;
}

function setMediaTime(video: HTMLVideoElement, currentTime: number, duration: number) {
  Object.defineProperty(video, "currentTime", { configurable: true, value: currentTime });
  Object.defineProperty(video, "duration", { configurable: true, value: duration });
}

describe("useDriveVideoPlayer time events", () => {
  it("reports metadata, playback time, and host-driven seek changes from the local media element", () => {
    const onTimeChange = vi.fn();
    render(<DrivePlayerHarness onTimeChange={onTimeChange} />);
    const video = screen.getByTestId("drive-video") as HTMLVideoElement;

    setMediaTime(video, 0, 2530);
    fireEvent.loadedMetadata(video);
    expect(onTimeChange).toHaveBeenLastCalledWith({ currentTimeSeconds: 0, durationSeconds: 2530 });

    setMediaTime(video, 4.5, 2530);
    fireEvent.timeUpdate(video);
    expect(onTimeChange).toHaveBeenLastCalledWith({ currentTimeSeconds: 4.5, durationSeconds: 2530 });

    setMediaTime(video, 180, 2530);
    fireEvent.seeked(video);
    expect(onTimeChange).toHaveBeenLastCalledWith({ currentTimeSeconds: 180, durationSeconds: 2530 });
  });

  it("normalizes unavailable duration without polling", () => {
    const onTimeChange = vi.fn();
    render(<DrivePlayerHarness onTimeChange={onTimeChange} />);
    const video = screen.getByTestId("drive-video") as HTMLVideoElement;
    setMediaTime(video, Number.NaN, Number.POSITIVE_INFINITY);
    fireEvent.durationChange(video);
    expect(onTimeChange).toHaveBeenLastCalledWith({ currentTimeSeconds: 0, durationSeconds: null });
  });
});
