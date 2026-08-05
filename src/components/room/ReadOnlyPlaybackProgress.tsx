import { formatPlaybackDuration, formatPlaybackTime, normalizePlaybackTime } from "../../utils/playbackDisplay";

export function ReadOnlyPlaybackProgress({ currentTimeSeconds, durationSeconds }: {
  currentTimeSeconds: number;
  durationSeconds: number | null;
}) {
  const time = normalizePlaybackTime(currentTimeSeconds, durationSeconds);
  const currentLabel = formatPlaybackTime(time.currentTimeSeconds);
  const durationLabel = formatPlaybackDuration(time.durationSeconds);

  return (
    <div data-testid="guest-playback-progress" className="pointer-events-none mb-2 px-1" aria-label="Playback position">
      <div className="mb-1.5 text-center text-xs font-medium tabular-nums text-zinc-100 sm:text-sm">
        {currentLabel} <span className="text-zinc-500">/</span> {durationLabel}
      </div>
      <div
        role="progressbar"
        aria-label="Read-only playback progress"
        aria-valuemin={0}
        aria-valuemax={time.durationSeconds ?? undefined}
        aria-valuenow={time.durationSeconds === null ? undefined : time.currentTimeSeconds}
        aria-valuetext={`${currentLabel} of ${durationLabel}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/18"
      >
        <div className="h-full rounded-full bg-[#76e4c4] transition-[width] duration-200 ease-linear" style={{ width: `${time.progressPercent}%` }} />
      </div>
    </div>
  );
}
