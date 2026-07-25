import type { PlaybackStatus } from "./database";

export interface PlaybackAdapterSnapshot {
  currentTimeSeconds: number;
  durationSeconds: number | null;
  playbackRate: number;
  playerState: number;
  availableRates: number[];
}

export interface PlaybackAdapter {
  ready: boolean;
  error: string | null;
  play: () => Promise<void> | void;
  pause: () => Promise<void> | void;
  seekTo: (seconds: number) => Promise<void> | void;
  setPlaybackRate: (rate: number) => Promise<void> | void;
  getSnapshot: () => PlaybackAdapterSnapshot;
}

export function statusFromHtmlVideo(video: HTMLVideoElement): PlaybackStatus {
  if (video.ended) return "ended";
  if (video.paused) return "paused";
  if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return "buffering";
  return "playing";
}
