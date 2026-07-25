import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDelayedSingleClick, usePlayerControlsVisibility } from "./usePlayerChrome";

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

  it("cancels a pending single click when a double click arrives", () => {
    vi.useFakeTimers();
    const singleClick = vi.fn();
    const { result } = renderHook(() => useDelayedSingleClick(240));
    act(() => result.current.scheduleSingleClick(singleClick));
    act(() => result.current.cancelSingleClick());
    act(() => vi.advanceTimersByTime(240));
    expect(singleClick).not.toHaveBeenCalled();
  });
});
