import { useCallback, useEffect, useRef, useState } from "react";

export const PLAYER_CONTROLS_HIDE_MS = 2_500;

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
