import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerControlsVisibility } from "./usePlayerChrome";

describe("player chrome", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-hides controls while playing and reveals them on interaction", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePlayerControlsVisibility(true, 2_500));
    expect(result.current.controlsVisible).toBe(true);
    act(() => vi.advanceTimersByTime(2_500));
    expect(result.current.controlsVisible).toBe(false);
    act(() => result.current.showControls());
    expect(result.current.controlsVisible).toBe(true);
  });

  it("keeps controls visible while paused", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePlayerControlsVisibility(false, 2_500));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.controlsVisible).toBe(true);
  });
});
