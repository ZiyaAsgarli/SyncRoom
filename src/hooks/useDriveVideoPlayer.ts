import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackStatus } from "../types/database";
import { statusFromHtmlVideo } from "../types/playbackAdapter";
import type { DriveElementError } from "./useDriveMediaLifecycle";

export function useDriveVideoPlayer(options: {
  src: string | null;
  generation: number;
  mimeType: string | null;
  onLoading?: () => void;
  onReady?: () => void;
  onCanPlay?: () => void;
  onStatusChange?: (status: PlaybackStatus) => void;
  onTimeChange?: (time: { currentTimeSeconds: number; durationSeconds: number | null }) => void;
  onError?: (error: DriveElementError) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const callbacksRef = useRef(options);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !options.src) return;
    const generation = options.generation;
    setReady(false);
    setError(null);

    const isCurrentGeneration = () => callbacksRef.current.generation === generation;
    let lastEmittedCurrentTime = -1;
    let lastEmittedDuration: number | null = null;
    const emitTime = (force = false) => {
      if (!isCurrentGeneration()) return;
      const currentTimeSeconds = Number.isFinite(video.currentTime) && video.currentTime >= 0 ? video.currentTime : 0;
      const durationSeconds = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      if (!force && Math.abs(currentTimeSeconds - lastEmittedCurrentTime) < 0.45 && durationSeconds === lastEmittedDuration) return;
      lastEmittedCurrentTime = currentTimeSeconds;
      lastEmittedDuration = durationSeconds;
      callbacksRef.current.onTimeChange?.({ currentTimeSeconds, durationSeconds });
    };
    const loadingHandler = () => {
      if (isCurrentGeneration()) callbacksRef.current.onLoading?.();
    };
    const readyHandler = () => {
      if (!isCurrentGeneration()) return;
      emitTime(true);
      setReady(true);
      callbacksRef.current.onReady?.();
    };
    const canPlayHandler = () => {
      if (!isCurrentGeneration()) return;
      callbacksRef.current.onCanPlay?.();
      callbacksRef.current.onStatusChange?.(statusFromHtmlVideo(video));
    };
    const timeHandler = () => emitTime();
    const durationHandler = () => emitTime(true);
    const statusHandler = () => {
      if (isCurrentGeneration()) {
        emitTime(true);
        callbacksRef.current.onStatusChange?.(statusFromHtmlVideo(video));
      }
    };
    const errorHandler = () => {
      if (!isCurrentGeneration()) return;
      setError("Drive media playback was interrupted.");
      callbacksRef.current.onError?.({ mediaErrorCode: video.error?.code ?? null });
    };

    video.addEventListener("loadstart", loadingHandler);
    video.addEventListener("loadedmetadata", readyHandler);
    video.addEventListener("durationchange", durationHandler);
    video.addEventListener("timeupdate", timeHandler);
    video.addEventListener("canplay", canPlayHandler);
    video.addEventListener("playing", statusHandler);
    video.addEventListener("pause", statusHandler);
    video.addEventListener("waiting", statusHandler);
    video.addEventListener("stalled", statusHandler);
    video.addEventListener("seeking", statusHandler);
    video.addEventListener("seeked", statusHandler);
    video.addEventListener("ended", statusHandler);
    video.addEventListener("error", errorHandler);
    return () => {
      video.removeEventListener("loadstart", loadingHandler);
      video.removeEventListener("loadedmetadata", readyHandler);
      video.removeEventListener("durationchange", durationHandler);
      video.removeEventListener("timeupdate", timeHandler);
      video.removeEventListener("canplay", canPlayHandler);
      video.removeEventListener("playing", statusHandler);
      video.removeEventListener("pause", statusHandler);
      video.removeEventListener("waiting", statusHandler);
      video.removeEventListener("stalled", statusHandler);
      video.removeEventListener("seeking", statusHandler);
      video.removeEventListener("seeked", statusHandler);
      video.removeEventListener("ended", statusHandler);
      video.removeEventListener("error", errorHandler);
    };
  }, [options.generation, options.src]);

  const play = useCallback(() => videoRef.current?.play(), []);
  const pause = useCallback(() => videoRef.current?.pause(), []);
  const reload = useCallback(() => videoRef.current?.load(), []);
  const seekTo = useCallback((seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, seconds);
  }, []);
  const setPlaybackRate = useCallback((rate: number) => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, []);
  const getSnapshot = useCallback(() => {
    const video = videoRef.current;
    return {
      currentTimeSeconds: video?.currentTime ?? 0,
      durationSeconds: video && Number.isFinite(video.duration) ? video.duration : null,
      playbackRate: video?.playbackRate ?? 1,
      playerState: video ? (video.paused ? 2 : 1) : -1,
      availableRates: [0.5, 0.75, 1, 1.25, 1.5, 2]
    };
  }, []);

  return { videoRef, ready, error, play, pause, reload, seekTo, setPlaybackRate, getSnapshot };
}
