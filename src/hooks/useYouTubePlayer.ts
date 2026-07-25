import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackStatus } from "../types/database";
import type { YouTubePlayer, YouTubeNamespace } from "../types/youtube";

let iframeApiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (iframeApiPromise) return iframeApiPromise;

  iframeApiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error("YouTube API did not initialize."));
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Could not load YouTube IFrame API."));
    document.head.appendChild(script);
  });

  return iframeApiPromise;
}

function statusFromPlayerState(state: number): PlaybackStatus {
  if (state === window.YT?.PlayerState.PLAYING) return "playing";
  if (state === window.YT?.PlayerState.PAUSED) return "paused";
  if (state === window.YT?.PlayerState.BUFFERING) return "buffering";
  if (state === window.YT?.PlayerState.ENDED) return "ended";
  if (state === window.YT?.PlayerState.CUED) return "cued";
  return "idle";
}

export function useYouTubePlayer(options: {
  videoId: string | null;
  onReady?: () => void;
  onStatusChange?: (status: PlaybackStatus) => void;
  onError?: (code: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const mountedRef = useRef(false);
  const callbacksRef = useRef(options);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  useEffect(() => {
    mountedRef.current = true;
    const node = containerRef.current;
    if (!node || !options.videoId) return;
    setReady(false);
    setError(null);

    void loadYouTubeIframeApi().then((YT) => {
      if (!mountedRef.current || !containerRef.current) return;
      playerRef.current?.destroy();
      playerRef.current = new YT.Player(containerRef.current, {
        videoId: options.videoId ?? undefined,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1, fs: 0 },
        events: {
          onReady: () => {
            if (!mountedRef.current) return;
            setReady(true);
            callbacksRef.current.onReady?.();
          },
          onStateChange: (event) => {
            if (!mountedRef.current) return;
            callbacksRef.current.onStatusChange?.(statusFromPlayerState(event.data));
          },
          onError: (event) => {
            if (!mountedRef.current) return;
            setError(`YouTube error ${event.data}`);
            callbacksRef.current.onError?.(event.data);
          }
        }
      });
    }).catch((loadError: unknown) => {
      if (mountedRef.current) setError(loadError instanceof Error ? loadError.message : "YouTube player could not load.");
    });

    return () => {
      mountedRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [options.videoId]);

  const cue = useCallback((videoId: string, seconds = 0) => playerRef.current?.cueVideoById(videoId, seconds), []);
  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const seekTo = useCallback((seconds: number) => playerRef.current?.seekTo(seconds, true), []);
  const setPlaybackRate = useCallback((rate: number) => playerRef.current?.setPlaybackRate(rate), []);
  const setVolume = useCallback((volume: number) => playerRef.current?.setVolume(volume), []);
  const mute = useCallback(() => playerRef.current?.mute(), []);
  const unMute = useCallback(() => playerRef.current?.unMute(), []);
  const getSnapshot = useCallback(() => ({
    currentTimeSeconds: playerRef.current?.getCurrentTime() ?? 0,
    durationSeconds: playerRef.current?.getDuration() ?? null,
    playbackRate: playerRef.current?.getPlaybackRate() ?? 1,
    playerState: playerRef.current?.getPlayerState() ?? -1,
    availableRates: playerRef.current?.getAvailablePlaybackRates() ?? [1]
  }), []);

  return { containerRef, ready, error, cue, play, pause, seekTo, setPlaybackRate, setVolume, mute, unMute, getSnapshot };
}
