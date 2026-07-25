import { useCallback, useEffect, useRef, useState } from "react";

export const PLAYER_CONTROLS_HIDE_MS = 2_500;
export const SURFACE_SINGLE_CLICK_DELAY_MS = 240;

export function usePlayerControlsVisibility(isPlaying: boolean, hideDelayMs = PLAYER_CONTROLS_HIDE_MS) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const showControls = useCallback(() => {
    clearHideTimer();
    setControlsVisible(true);
    if (isPlaying) {
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), hideDelayMs);
    }
  }, [clearHideTimer, hideDelayMs, isPlaying]);

  useEffect(() => {
    if (isPlaying) showControls();
    else {
      clearHideTimer();
      setControlsVisible(true);
    }
    return clearHideTimer;
  }, [clearHideTimer, isPlaying, showControls]);

  return { controlsVisible, showControls };
}

export function useDelayedSingleClick(delayMs = SURFACE_SINGLE_CLICK_DELAY_MS) {
  const clickTimerRef = useRef<number | null>(null);

  const cancelSingleClick = useCallback(() => {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  }, []);

  const scheduleSingleClick = useCallback((callback: () => void) => {
    cancelSingleClick();
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      callback();
    }, delayMs);
  }, [cancelSingleClick, delayMs]);

  useEffect(() => cancelSingleClick, [cancelSingleClick]);

  return { scheduleSingleClick, cancelSingleClick };
}
