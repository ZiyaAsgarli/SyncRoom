export interface SafePlaybackTime {
  currentTimeSeconds: number;
  durationSeconds: number | null;
  progressPercent: number;
}

export function normalizePlaybackTime(currentTimeSeconds: number, durationSeconds: number | null): SafePlaybackTime {
  const safeCurrent = Number.isFinite(currentTimeSeconds) && currentTimeSeconds >= 0 ? currentTimeSeconds : 0;
  const safeDuration = durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : null;
  const boundedCurrent = safeDuration === null ? safeCurrent : Math.min(safeCurrent, safeDuration);
  return {
    currentTimeSeconds: boundedCurrent,
    durationSeconds: safeDuration,
    progressPercent: safeDuration === null ? 0 : Math.min(100, Math.max(0, (boundedCurrent / safeDuration) * 100))
  };
}

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function formatPlaybackDuration(durationSeconds: number | null): string {
  return durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0
    ? "--:--"
    : formatPlaybackTime(durationSeconds);
}
