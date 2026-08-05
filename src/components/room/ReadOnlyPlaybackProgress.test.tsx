import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadOnlyPlaybackProgress } from "./ReadOnlyPlaybackProgress";

describe("ReadOnlyPlaybackProgress", () => {
  it("shows guest current time, duration, and progress", () => {
    render(<ReadOnlyPlaybackProgress currentTimeSeconds={204} durationSeconds={2530} />);
    expect(screen.getByText("03:24", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("42:10", { exact: false })).toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: "Read-only playback progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "204");
    expect(progress).toHaveAttribute("aria-valuemax", "2530");
    expect(progress).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("renders a safe metadata-loading state", () => {
    render(<ReadOnlyPlaybackProgress currentTimeSeconds={Number.NaN} durationSeconds={Number.POSITIVE_INFINITY} />);
    expect(screen.getByText("00:00", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("--:--", { exact: false })).toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: "Read-only playback progress" });
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(progress).not.toHaveAttribute("aria-valuemax");
  });
});
