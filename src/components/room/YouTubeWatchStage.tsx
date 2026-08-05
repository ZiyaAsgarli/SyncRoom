import { Captions, Clipboard, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DRIVE_SCOPE, getDriveEnvironment } from "../../config/drive";
import { PLAYBACK_TIMING } from "../../config/playback";
import { useDriveVideoPlayer } from "../../hooks/useDriveVideoPlayer";
import { useDriveMediaLifecycle, type DriveElementError } from "../../hooks/useDriveMediaLifecycle";
import { shouldShowDriveConnect, useDriveSilentBootstrap } from "../../hooks/useDriveSilentBootstrap";
import { usePlaybackRoomChannel } from "../../hooks/usePlaybackRoomChannel";
import { usePlayerControlsVisibility } from "../../hooks/usePlayerChrome";
import { useYouTubePlayer } from "../../hooks/useYouTubePlayer";
import { getDriveAuthSnapshot, requestDriveAccessToken, subscribeDriveAuth } from "../../services/driveAuth";
import { fetchDriveFileMetadata } from "../../services/driveMetadata";
import { pickDriveVideo } from "../../services/drivePicker";
import type { Message, Profile, Room, RoomPlaybackState } from "../../types/database";
import type { PlaybackEvent } from "../../types/playback";
import type { PlaybackAdapter } from "../../types/playbackAdapter";
import { formatFileSize, playbackStateToMediaSource } from "../../utils/mediaSource";
import { isAutoplayPolicyError } from "../../utils/drivePlaybackControls";
import { driveMediaErrorMessage } from "../../utils/driveMediaLifecycle";
import { toggleElementFullscreen, unlockScreenOrientation, type ScreenOrientationController } from "../../utils/fullscreen";
import { canControlPlayback } from "../../utils/playbackPermissions";
import { calculateAuthoritativeTargetTime, createHeartbeatPayload, decideDriftCorrection, isBackwardHeartbeatUnsafe, issueRelativeAuthoritativeSeek } from "../../utils/playbackSync";
import { createQueuedRemotePlay, getQueuedRemotePlayTarget, remotePlayBlockReason, shouldReplaceQueuedPlay, type QueuedRemotePlay } from "../../utils/remotePlay";
import { parseYouTubeUrl } from "../../utils/youtube";
import { formatPlaybackDuration, formatPlaybackTime } from "../../utils/playbackDisplay";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { FlowingMessages } from "./FlowingMessages";
import { ReadOnlyPlaybackProgress } from "./ReadOnlyPlaybackProgress";

interface YouTubeWatchStageProps {
  room: Room;
  currentProfile: Profile;
  hostProfile: Profile | null;
  flowMessages: Message[];
  flowingEnabled: boolean;
}

interface RemotePlaybackActions {
  setSnapshotSource: (event: PlaybackEvent) => void;
  getSnapshot: PlaybackAdapter["getSnapshot"];
  applyRemotePlay: (event: PlaybackEvent, targetTimeSeconds: number) => void;
  seekTo: PlaybackAdapter["seekTo"];
  setPlaybackRate: PlaybackAdapter["setPlaybackRate"];
  play: PlaybackAdapter["play"];
  pause: PlaybackAdapter["pause"];
}

export function YouTubeWatchStage({ room, currentProfile, hostProfile, flowMessages, flowingEnabled }: YouTubeWatchStageProps) {
  const isHost = canControlPlayback(room, currentProfile.user_id);
  const [sourceTab, setSourceTab] = useState<"youtube" | "google_drive">("youtube");
  const [url, setUrl] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveAuth, setDriveAuth] = useState(getDriveAuthSnapshot);
  const [localReady, setLocalReady] = useState(false);
  const [remoteBlocked, setRemoteBlocked] = useState(false);
  const [, setQueuedRemotePlay] = useState<QueuedRemotePlay | null>(null);
  const [, setSyncLabel] = useState(isHost ? "Waiting for friend" : "Waiting for host");
  const [isLocalPlaying, setIsLocalPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [youTubeControlsMode, setYouTubeControlsMode] = useState(false);
  const [localVolume, setLocalVolume] = useState(1);
  const [localMuted, setLocalMuted] = useState(false);
  const [displayTime, setDisplayTime] = useState<{ currentTimeSeconds: number; durationSeconds: number | null }>({ currentTimeSeconds: 0, durationSeconds: null });
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [transientOverlay, setTransientOverlay] = useState<string | null>(null);
  const suppressRemoteUntil = useRef(0);
  const previousHeartbeatTime = useRef<number | null>(null);
  const localReadyRef = useRef(false);
  const playerReadyRef = useRef(false);
  const activePlayerRef = useRef<PlaybackAdapter | null>(null);
  const activeSourceRef = useRef<ReturnType<typeof playbackStateToMediaSource>>(null);
  const playbackSnapshotRef = useRef<RoomPlaybackState | null>(null);
  const queuedRemotePlayRef = useRef<QueuedRemotePlay | null>(null);
  const playerStageRef = useRef<HTMLDivElement | null>(null);
  const transientTimerRef = useRef<number | null>(null);
  const lastCommittedSeekRef = useRef<number | null>(null);
  const recoveryRestoreRef = useRef<{ generation: number; currentTimeSeconds: number; playbackRate: number; shouldPlay: boolean } | null>(null);
  const wasStageFullscreenRef = useRef(false);
  const youTubeControlsModeRef = useRef(false);
  const remoteActionsRef = useRef<RemotePlaybackActions>({
    setSnapshotSource: () => undefined,
    getSnapshot: () => ({ currentTimeSeconds: 0, durationSeconds: null, playbackRate: 1, playerState: -1, availableRates: [1] }),
    applyRemotePlay: () => undefined,
    seekTo: () => undefined,
    setPlaybackRate: () => undefined,
    play: () => undefined,
    pause: () => undefined
  });

  const playback = usePlaybackRoomChannel({
    roomId: room.id,
    localUserId: currentProfile.user_id,
    hostUserId: room.host_user_id,
    isHost,
    onRemoteEvent: (event) => onRemoteEvent(event)
  });

  const playbackSnapshot = playback.snapshot;
  const activeSource = playbackStateToMediaSource(playbackSnapshot);
  const activeDriveSource = activeSource?.type === "google_drive" ? activeSource : null;
  const driveBootstrap = useDriveSilentBootstrap(activeDriveSource, currentProfile.email, driveAuth);
  const driveLifecycle = useDriveMediaLifecycle(activeDriveSource, driveAuth);

  const youTubePlayer = useYouTubePlayer({
    videoId: activeSource?.type === "youtube" ? activeSource.videoId : null,
    onReady: () => markPlayerReady(),
    onStatusChange: (status) => handleLocalStatusChange(status),
    onError: () => setSyncLabel("Playback blocked")
  });

  const drivePlayer = useDriveVideoPlayer({
    src: driveLifecycle.mediaSrc,
    generation: driveLifecycle.state.generation,
    mimeType: activeSource?.type === "google_drive" ? activeSource.mimeType : null,
    onLoading: driveLifecycle.markMediaLoading,
    onReady: () => {
      driveLifecycle.markMediaReady();
      restoreDrivePlaybackAfterRecovery();
      markPlayerReady();
    },
    onCanPlay: driveLifecycle.markPlayable,
    onStatusChange: (status) => handleLocalStatusChange(status),
    onTimeChange: setDisplayTime,
    onError: (error) => void handleDriveMediaError(error)
  });

  const activePlayer: PlaybackAdapter = activeSource?.type === "google_drive" ? drivePlayer : youTubePlayer;
  const activeReady = activeSource?.type === "google_drive" ? drivePlayer.ready : youTubePlayer.ready;
  const activeSourceType = activeSource?.type;
  const activeSourceKey = activeSource?.type === "youtube" ? activeSource.videoId : activeSource?.type === "google_drive" ? activeSource.fileId : null;
  const activeDriveFileId = activeSource?.type === "google_drive" ? activeSource.fileId : null;
  const playbackStatus = playbackSnapshot?.playback_status;
  const { controlsVisible, showControls } = usePlayerControlsVisibility(isLocalPlaying);

  useEffect(() => {
    activePlayerRef.current = activePlayer;
  }, [activePlayer]);

  useEffect(() => {
    activeSourceRef.current = activeSource;
  }, [activeSource]);

  useEffect(() => {
    playbackSnapshotRef.current = playbackSnapshot;
  }, [playbackSnapshot]);

  useEffect(() => subscribeDriveAuth(setDriveAuth), []);

  useEffect(() => {
    const onFullscreenChange = () => {
      const nextFullscreen = document.fullscreenElement === playerStageRef.current;
      if (wasStageFullscreenRef.current && !nextFullscreen) {
        unlockScreenOrientation(getScreenOrientation());
      }
      wasStageFullscreenRef.current = nextFullscreen;
      setIsFullscreen(nextFullscreen);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!controlsVisible || !activeSourceKey || activeSourceType === "google_drive") return;
    const updateDisplayTime = () => {
      const snapshot = activePlayerRef.current?.getSnapshot();
      if (!snapshot) return;
      setDisplayTime({
        currentTimeSeconds: snapshot.currentTimeSeconds,
        durationSeconds: snapshot.durationSeconds
      });
    };
    updateDisplayTime();
    const timer = window.setInterval(updateDisplayTime, 500);
    return () => window.clearInterval(timer);
  }, [activeSourceKey, activeSourceType, controlsVisible, isLocalPlaying]);

  useEffect(() => {
    setDisplayTime({ currentTimeSeconds: 0, durationSeconds: null });
    setSeekDraft(null);
  }, [activeSourceKey]);

  useEffect(() => () => {
    if (transientTimerRef.current !== null) window.clearTimeout(transientTimerRef.current);
  }, []);

  function markPlayerReady() {
    playerReadyRef.current = true;
    if (activeSourceRef.current?.type === "google_drive" && import.meta.env.DEV) console.debug("[SyncRoom Drive playback]", { state: "media ready" });
    setSyncLabel(localReadyRef.current ? "In sync" : isHost ? "Ready to play" : "Tap once to sync");
    void playback.sendSyncRequest();
    if (!isHost && !localReadyRef.current) void unlockPlaybackFromVideo();
  }

  function handleLocalStatusChange(status: "idle" | "loading" | "cued" | "playing" | "paused" | "buffering" | "ended" | "error") {
    if (status === "playing") setIsLocalPlaying(true);
    if (status === "paused" || status === "ended" || status === "cued" || status === "idle") setIsLocalPlaying(false);
    if (activeSourceRef.current?.type === "google_drive" && status === "playing") {
      setRemoteBlocked(false);
      if (localReadyRef.current) setSyncLabel("In sync");
    }
    if (!isHost || Date.now() < suppressRemoteUntil.current) return;
    if (status === "buffering") setSyncLabel("Buffering");
    if (status === "playing" && localReadyRef.current) setSyncLabel("In sync");
    if (status === "error") setSyncLabel("Playback blocked");
  }

  const onRemoteEvent = useCallback((event: PlaybackEvent) => {
    suppressRemoteUntil.current = Date.now() + PLAYBACK_TIMING.remoteSuppressionMs;
    if (event.type === "source:set") {
      remoteActionsRef.current.setSnapshotSource(event);
      setLocalReady(false);
      localReadyRef.current = false;
      setSyncLabel("Waiting for playback");
      return;
    }

    if (event.type === "playback:play") {
      const target = event.currentTimeSeconds !== undefined && event.playbackRate
        ? calculateAuthoritativeTargetTime({ eventCurrentTime: event.currentTimeSeconds, sentAt: event.sentAt, playbackRate: event.playbackRate, playbackStatus: event.playbackStatus })
        : remoteActionsRef.current.getSnapshot().currentTimeSeconds;
      if (activeSourceRef.current?.type === "google_drive" && import.meta.env.DEV) console.debug("[SyncRoom Drive playback]", { state: "remote Play received", playerReady: playerReadyRef.current, localUnlockReady: localReadyRef.current });
      remoteActionsRef.current.applyRemotePlay(event, target);
      return;
    }

    if (event.currentTimeSeconds !== undefined && event.playbackRate) {
      const target = calculateAuthoritativeTargetTime({ eventCurrentTime: event.currentTimeSeconds, sentAt: event.sentAt, playbackRate: event.playbackRate, playbackStatus: event.playbackStatus });
      const localSnapshot = remoteActionsRef.current.getSnapshot();
      const local = localSnapshot.currentTimeSeconds;
      const decision = decideDriftCorrection({
        localTimeSeconds: local,
        targetTimeSeconds: target,
        hostPlaybackRate: event.playbackRate,
        buffering: event.playbackStatus === "buffering",
        canSetPlaybackRate: localSnapshot.availableRates.includes(event.playbackRate),
        hostDragging: false
      });
      if (isBackwardHeartbeatUnsafe({ eventType: event.type, playbackStatus: event.playbackStatus, driftSeconds: decision.driftSeconds, sameStateVersion: true })) {
        if (import.meta.env.DEV) console.info("[SyncRoom playback] stale backward heartbeat ignored", { guest: local, target, drift: decision.driftSeconds, stateVersion: event.stateVersion });
        return;
      }
      if (import.meta.env.DEV && event.type === "playback:heartbeat") {
        console.info("[SyncRoom playback] heartbeat received", {
          guest: Number(local.toFixed(2)),
          target: Number(target.toFixed(2)),
          drift: Number(decision.driftSeconds.toFixed(2)),
          action: decision.action,
          stateVersion: event.stateVersion,
          ageMs: Date.now() - Date.parse(event.sentAt)
        });
      }
      if (decision.action === "seek") remoteActionsRef.current.seekTo(decision.targetTimeSeconds);
      if (decision.action === "rate") remoteActionsRef.current.setPlaybackRate(decision.temporaryRate);
      setSyncLabel(decision.action === "none" ? "In sync" : "Correcting");
    }

    if (event.type === "playback:pause") {
      queuedRemotePlayRef.current = null;
      setQueuedRemotePlay(null);
      remoteActionsRef.current.pause();
    }
    if (event.type === "playback:seek" && event.currentTimeSeconds !== undefined) remoteActionsRef.current.seekTo(event.currentTimeSeconds);
    if (event.type === "playback:rate" && event.playbackRate) remoteActionsRef.current.setPlaybackRate(event.playbackRate);
  }, []);

  const executeQueuedRemotePlay = useCallback(async (queued: QueuedRemotePlay) => {
    suppressRemoteUntil.current = Date.now() + PLAYBACK_TIMING.remoteSuppressionMs;
    const snapshot = activePlayer.getSnapshot();
    const latestTargetTime = getQueuedRemotePlayTarget(queued);
    const decision = decideDriftCorrection({
      localTimeSeconds: snapshot.currentTimeSeconds,
      targetTimeSeconds: latestTargetTime,
      hostPlaybackRate: queued.playbackRate,
      buffering: false,
      canSetPlaybackRate: snapshot.availableRates.includes(queued.playbackRate),
      hostDragging: false
    });
    if (decision.action === "seek") activePlayer.seekTo(decision.targetTimeSeconds);
    if (decision.action === "rate") activePlayer.setPlaybackRate(decision.temporaryRate);
    activePlayer.setPlaybackRate(queued.playbackRate);
    if (import.meta.env.DEV && activeSourceRef.current?.type === "google_drive") console.debug("[SyncRoom Drive playback]", { state: "remote Play applied", correction: decision.action });
    try {
      await Promise.resolve(activePlayer.play());
    } catch (error) {
      setRemoteBlocked(true);
      setSyncLabel("Tap once to sync");
      if (import.meta.env.DEV && activeSourceRef.current?.type === "google_drive") console.debug("[SyncRoom Drive playback]", { state: "autoplay blocked", autoplayPolicy: isAutoplayPolicyError(error) });
      return false;
    }
    window.setTimeout(() => {
      const state = activePlayer.getSnapshot().playerState;
      if (state !== 1) {
        setRemoteBlocked(true);
        setSyncLabel("Tap once to sync");
        return;
      }
      setRemoteBlocked(false);
      setQueuedRemotePlay(null);
      queuedRemotePlayRef.current = null;
      setSyncLabel("In sync");
    }, 1200);
    return true;
  }, [activePlayer]);

  const queueOrApplyRemotePlay = useCallback((event: PlaybackEvent, targetTimeSeconds: number) => {
    const queued = createQueuedRemotePlay(event, targetTimeSeconds);
    if (!queued) return;
    const blockReason = remotePlayBlockReason({ playerReady: playerReadyRef.current, localReady: localReadyRef.current });
    if (blockReason) {
      if (shouldReplaceQueuedPlay(queuedRemotePlayRef.current, queued)) {
        queuedRemotePlayRef.current = queued;
        setQueuedRemotePlay(queued);
      }
      setSyncLabel(blockReason === "player-not-ready" ? "Waiting for player" : "Tap once to sync");
      if (import.meta.env.DEV && activeSourceRef.current?.type === "google_drive") console.debug("[SyncRoom Drive playback]", { state: "latest Play queued", reason: blockReason });
      return;
    }
    if (shouldReplaceQueuedPlay(queuedRemotePlayRef.current, queued)) {
      queuedRemotePlayRef.current = queued;
      setQueuedRemotePlay(queued);
      void executeQueuedRemotePlay(queued);
    }
  }, [executeQueuedRemotePlay]);

  useEffect(() => {
    remoteActionsRef.current = {
      setSnapshotSource: (event) => playback.setSnapshot((snapshot) => snapshot ? {
        ...snapshot,
        source_type: event.sourceType ?? snapshot.source_type,
        youtube_video_id: event.sourceType === "youtube" ? event.videoId ?? null : null,
        drive_file_id: event.sourceType === "google_drive" ? event.driveFileId ?? snapshot.drive_file_id : null,
        playback_status: "cued",
        current_time_seconds: 0,
        playback_rate: 1,
        state_version: event.stateVersion
      } : snapshot),
      getSnapshot: activePlayer.getSnapshot,
      applyRemotePlay: queueOrApplyRemotePlay,
      seekTo: activePlayer.seekTo,
      setPlaybackRate: activePlayer.setPlaybackRate,
      play: activePlayer.play,
      pause: activePlayer.pause
    };
  }, [activePlayer, playback, queueOrApplyRemotePlay]);

  useEffect(() => {
    localReadyRef.current = localReady;
  }, [localReady]);

  useEffect(() => {
    playerReadyRef.current = activeReady;
    const queued = queuedRemotePlayRef.current;
    if (activeReady && localReady && queued) void executeQueuedRemotePlay(queued);
  }, [activeReady, executeQueuedRemotePlay, localReady]);

  async function loadSource() {
    const parsed = parseYouTubeUrl(url);
    if (!parsed.ok) {
      setSourceError(parsed.error);
      return;
    }
    setSourceError(null);
    if (activeSource && !window.confirm("Replace the current video?")) return;
    await playback.chooseSource(parsed.videoId);
    setUrl("");
  }

  async function chooseDriveSource() {
    const env = getDriveEnvironment();
    if (!env.configured) {
      setDriveError(`Drive is not configured: ${env.missing.join(", ")}`);
      return;
    }
    setDriveError(null);
    setDriveStatus("Opening Google Drive...");
    try {
      const accessToken = await requestDriveAccessToken({ loginHint: currentProfile.email });
      const metadata = await pickDriveVideo(accessToken);
      if (metadata.size === null) throw new Error("Drive file size is required for media streaming.");
      await playback.chooseDriveSource(metadata);
      setDriveStatus(`${metadata.name} selected`);
    } catch (error) {
      setDriveError(error instanceof Error ? error.message : "Google Drive selection failed.");
      setDriveStatus(null);
    }
  }

  async function connectDriveForCurrentSource() {
    if (activeSource?.type !== "google_drive") return;
    setDriveError(null);
    setDriveStatus("Connecting Google Drive...");
    try {
      const accessToken = await requestDriveAccessToken({ loginHint: currentProfile.email });
      let metadata;
      try {
        metadata = await fetchDriveFileMetadata(accessToken, activeSource.fileId);
      } catch {
        setDriveStatus("Select the exact file chosen by the host...");
        metadata = await pickDriveVideo(accessToken, activeSource.fileId);
      }
      if (metadata.id !== activeSource.fileId) throw new Error("Please select the exact Drive file chosen by the host.");
      if (metadata.size === null) throw new Error("Drive file size is required for media streaming.");
      await driveLifecycle.bindCurrent();
      setDriveStatus("Drive connected");
    } catch (error) {
      setDriveError(error instanceof Error ? error.message : "Drive access is required for this video.");
      setDriveStatus(null);
    }
  }

  async function hostCommand(eventType: "playback:play" | "playback:pause" | "playback:seek" | "playback:rate", status: "playing" | "paused" | "cued", nextTime?: number, nextRate?: number) {
    if (!isHost) return;
    const snapshot = activePlayer.getSnapshot();
    await playback.persistAndBroadcast({
      playbackStatus: status,
      currentTimeSeconds: nextTime ?? snapshot.currentTimeSeconds,
      playbackRate: nextRate ?? snapshot.playbackRate,
      durationSeconds: snapshot.durationSeconds,
      eventType
    });
  }

  async function markLocalPlaybackReady() {
    if (localReadyRef.current) return;
    localReadyRef.current = true;
    setLocalReady(true);
    await playback.sendReady();
    if (activeSourceRef.current?.type === "google_drive" && import.meta.env.DEV) console.debug("[SyncRoom Drive playback]", { state: "local unlock ready" });
  }

  async function unlockPlaybackFromVideo() {
    if (!activeReady) {
      setSyncLabel("Waiting for player");
      return;
    }
    suppressRemoteUntil.current = Date.now() + PLAYBACK_TIMING.remoteSuppressionMs;
    setRemoteBlocked(false);
    const queued = queuedRemotePlayRef.current;
    if (queued) {
      const applied = await executeQueuedRemotePlay(queued);
      if (applied) await markLocalPlaybackReady();
      return;
    }
    try {
      const authoritative = playbackSnapshotRef.current;
      if (authoritative?.playback_status === "playing") {
        const target = calculateAuthoritativeTargetTime({
          eventCurrentTime: authoritative.current_time_seconds,
          sentAt: authoritative.updated_at,
          playbackRate: authoritative.playback_rate,
          playbackStatus: authoritative.playback_status
        });
        activePlayer.seekTo(target);
        activePlayer.setPlaybackRate(authoritative.playback_rate);
        await Promise.resolve(activePlayer.play());
      } else {
        await Promise.resolve(activePlayer.play());
        activePlayer.pause();
      }
    } catch {
      setRemoteBlocked(true);
      setSyncLabel("Tap once to sync");
      return;
    }
    await markLocalPlaybackReady();
    setSyncLabel("In sync");
  }

  async function issueHostPlay() {
    if (!isHost || !activeReady) return;
    suppressRemoteUntil.current = Date.now() + PLAYBACK_TIMING.remoteSuppressionMs;
    try {
      await Promise.resolve(activePlayer.play());
      await markLocalPlaybackReady();
      await hostCommand("playback:play", "playing");
      setSyncLabel("In sync");
    } catch {
      setRemoteBlocked(true);
      setSyncLabel("Tap video to play");
    }
  }

  async function issueHostPause() {
    if (!isHost || !activeReady) return;
    activePlayer.pause();
    await hostCommand("playback:pause", "paused");
    setSyncLabel("Paused");
  }

  function showTransientOverlay(message: string): void {
    if (transientTimerRef.current !== null) window.clearTimeout(transientTimerRef.current);
    setTransientOverlay(message);
    transientTimerRef.current = window.setTimeout(() => {
      setTransientOverlay(null);
      transientTimerRef.current = null;
    }, 1_500);
  }

  async function togglePlayerFullscreen(): Promise<void> {
    const target = playerStageRef.current;
    if (!target) return;
    try {
      const preferLandscape = typeof window.matchMedia === "function"
        && window.matchMedia("(orientation: portrait) and (max-width: 1180px)").matches;
      await toggleElementFullscreen(target, document.fullscreenElement, () => document.exitFullscreen(), {
        orientation: getScreenOrientation(),
        preferLandscape
      });
    } catch {
      showTransientOverlay("Fullscreen unavailable");
    }
  }

  function handleVideoSurfaceClick(): void {
    if (youTubeControlsModeRef.current) return;
    showControls();
  }

  function handleVideoSurfaceDoubleClick(): void {
    showControls();
    void togglePlayerFullscreen();
  }

  function openYouTubeControls(): void {
    if (activeSourceRef.current?.type !== "youtube") return;
    youTubeControlsModeRef.current = true;
    setYouTubeControlsMode(true);
  }

  function closeYouTubeControls(): void {
    youTubeControlsModeRef.current = false;
    setYouTubeControlsMode(false);
    showControls();
    const authoritative = playbackSnapshotRef.current;
    const player = activePlayerRef.current;
    if (!authoritative || !player || activeSourceRef.current?.type !== "youtube") return;
    const target = calculateAuthoritativeTargetTime({
      eventCurrentTime: authoritative.current_time_seconds,
      sentAt: authoritative.updated_at,
      playbackRate: authoritative.playback_rate,
      playbackStatus: authoritative.playback_status
    });
    suppressRemoteUntil.current = Date.now() + PLAYBACK_TIMING.remoteSuppressionMs;
    player.seekTo(target);
    player.setPlaybackRate(authoritative.playback_rate);
    if (authoritative.playback_status === "playing") {
      void Promise.resolve(player.play()).catch(() => setRemoteBlocked(true));
    } else {
      player.pause();
    }
  }

  function updateLocalVolume(nextVolume: number): void {
    const normalized = Math.min(1, Math.max(0, nextVolume));
    setLocalVolume(normalized);
    setLocalMuted(false);
    if (activeSource?.type === "google_drive") {
      const video = drivePlayer.videoRef.current;
      if (video) {
        video.volume = normalized;
        video.muted = false;
      }
    } else {
      youTubePlayer.setVolume(Math.round(normalized * 100));
      youTubePlayer.unMute();
    }
  }

  function toggleLocalMute(): void {
    const nextMuted = !localMuted;
    setLocalMuted(nextMuted);
    if (activeSource?.type === "google_drive") {
      if (drivePlayer.videoRef.current) drivePlayer.videoRef.current.muted = nextMuted;
    } else if (nextMuted) youTubePlayer.mute();
    else youTubePlayer.unMute();
  }

  function commitHostSeek(nextTime: number): void {
    if (!isHost || !Number.isFinite(nextTime) || lastCommittedSeekRef.current === nextTime) return;
    lastCommittedSeekRef.current = nextTime;
    activePlayer.seekTo(nextTime);
    setSeekDraft(null);
    void hostCommand("playback:seek", isLocalPlaying ? "playing" : "paused", nextTime);
  }

  function issueHostRelativeSeek(offsetSeconds: number): void {
    if (!activeReady) return;
    const snapshot = activePlayer.getSnapshot();
    lastCommittedSeekRef.current = null;
    issueRelativeAuthoritativeSeek({
      isHost,
      currentTimeSeconds: snapshot.currentTimeSeconds,
      durationSeconds: snapshot.durationSeconds,
      offsetSeconds,
      commitSeek: commitHostSeek
    });
  }

  async function handleDriveMediaError(error: DriveElementError, manual = false): Promise<void> {
    const generation = driveLifecycle.state.generation;
    const authoritative = playbackSnapshotRef.current;
    const shouldPlay = authoritative?.playback_status === "playing";
    const targetTime = authoritative
      ? calculateAuthoritativeTargetTime({
          eventCurrentTime: authoritative.current_time_seconds,
          sentAt: authoritative.updated_at,
          playbackRate: authoritative.playback_rate,
          playbackStatus: authoritative.playback_status
        })
      : drivePlayer.getSnapshot().currentTimeSeconds;
    const result = await driveLifecycle.recover(error, manual);
    if (generation !== driveLifecycle.state.generation) return;
    if (!result.recovered) {
      setDriveError(driveMediaErrorMessage(result.code));
      setSyncLabel(result.code === "DRIVE_AUTH_REQUIRED" ? "Drive authorization required" : "Playback interrupted");
      return;
    }
    recoveryRestoreRef.current = {
      generation,
      currentTimeSeconds: targetTime,
      playbackRate: authoritative?.playback_rate ?? 1,
      shouldPlay
    };
    setDriveError(null);
    drivePlayer.reload();
  }

  function restoreDrivePlaybackAfterRecovery(): void {
    const recovery = recoveryRestoreRef.current;
    if (!recovery || recovery.generation !== driveLifecycle.state.generation) return;
    recoveryRestoreRef.current = null;
    drivePlayer.seekTo(recovery.currentTimeSeconds);
    drivePlayer.setPlaybackRate(recovery.playbackRate);
    if (recovery.shouldPlay) {
      void Promise.resolve(drivePlayer.play()).catch(() => {
        setRemoteBlocked(true);
        setSyncLabel("Tap once to sync");
      });
    }
  }

  const broadcastPlaybackEvent = playback.broadcastPlaybackEvent;
  const persistPlaybackSnapshot = playback.persistSnapshot;

  useEffect(() => {
    if (!isHost || !activeSourceKey || playbackStatus !== "playing") return;
    if (import.meta.env.DEV) console.info("[SyncRoom playback] heartbeat timer created", { sourceType: activeSourceType });
    const heartbeat = window.setInterval(() => {
      if (youTubeControlsModeRef.current) return;
      const player = activePlayerRef.current;
      const source = activeSourceRef.current;
      const authoritative = playbackSnapshotRef.current;
      if (!player || !source || !authoritative) return;
      const snapshot = player.getSnapshot();
      const currentTime = snapshot.currentTimeSeconds;
      if (import.meta.env.DEV) {
        console.info("[SyncRoom playback] heartbeat sent", {
          currentTime: Number(currentTime.toFixed(2)),
          previousHeartbeatTime: previousHeartbeatTime.current === null ? null : Number(previousHeartbeatTime.current.toFixed(2))
        });
      }
      previousHeartbeatTime.current = currentTime;
      void broadcastPlaybackEvent(createHeartbeatPayload({
        videoId: source.type === "youtube" ? source.videoId : null,
        driveFileId: source.type === "google_drive" ? source.fileId : null,
        stateVersion: authoritative.state_version,
        currentTimeSeconds: currentTime,
        playbackRate: snapshot.playbackRate,
        playbackStatus: "playing"
      }));
    }, PLAYBACK_TIMING.heartbeatMs);
    return () => {
      if (import.meta.env.DEV) console.info("[SyncRoom playback] heartbeat timer cleared", { sourceType: activeSourceType });
      window.clearInterval(heartbeat);
    };
  }, [activeSourceKey, activeSourceType, broadcastPlaybackEvent, isHost, playbackStatus]);

  useEffect(() => {
    if (!isHost || !activeSourceKey || playbackStatus !== "playing") return;
    if (import.meta.env.DEV) console.info("[SyncRoom playback] snapshot timer created", { sourceType: activeSourceType });
    const snapshotPersist = window.setInterval(() => {
      if (youTubeControlsModeRef.current) return;
      const player = activePlayerRef.current;
      const source = activeSourceRef.current;
      if (!player || !source) return;
      const snapshot = player.getSnapshot();
      void persistPlaybackSnapshot({
        playbackStatus: "playing",
        currentTimeSeconds: snapshot.currentTimeSeconds,
        playbackRate: snapshot.playbackRate,
        durationSeconds: snapshot.durationSeconds,
        sourceType: source.type
      });
    }, PLAYBACK_TIMING.snapshotPersistMs);
    return () => {
      if (import.meta.env.DEV) console.info("[SyncRoom playback] snapshot timer cleared", { sourceType: activeSourceType });
      window.clearInterval(snapshotPersist);
    };
  }, [activeSourceKey, activeSourceType, isHost, persistPlaybackSnapshot, playbackStatus]);

  useEffect(() => {
    setLocalReady(false);
    localReadyRef.current = false;
    setRemoteBlocked(false);
    setQueuedRemotePlay(null);
    queuedRemotePlayRef.current = null;
    youTubeControlsModeRef.current = false;
    setYouTubeControlsMode(false);
    if (activeSourceType !== "google_drive") {
      setDriveStatus(null);
      setDriveError(null);
    }
  }, [activeDriveFileId, activeSourceType]);

  const driveConfigured = getDriveEnvironment().configured;
  const showDriveConnect = activeSource?.type === "google_drive" && !driveLifecycle.mediaSrc && shouldShowDriveConnect(driveBootstrap, driveAuth.reconnectRequired);
  const showDrivePreparing = activeSource?.type === "google_drive" && !driveLifecycle.mediaSrc && !showDriveConnect;
  const showPlaybackUnlockOverlay = Boolean(activeSource && activeReady && !isHost && (!localReady || remoteBlocked));
  const showPlayerControls = Boolean(activeSource && activeReady && controlsVisible && !youTubeControlsMode);
  const needsSetupFrame = !activeSource || showDriveConnect;
  const visibleCurrentTime = seekDraft ?? displayTime.currentTimeSeconds;
  const seekMaximum = Math.max(1, displayTime.durationSeconds ?? 0);
  const statusOverlay = playback.status === "Reconnecting" ? "Reconnecting..." : transientOverlay;

  return (
    <section className="flex min-h-0 flex-col">
      <div
        ref={playerStageRef}
        data-testid="watch-stage"
        data-media-active={activeSource ? "true" : "false"}
        className={`watch-stage relative w-full max-w-full overflow-hidden bg-black xl:min-h-0 ${isFullscreen ? "h-dvh max-h-none w-screen rounded-none border-0 shadow-none" : needsSetupFrame ? "min-h-[24rem] border-y border-white/12 shadow-[0_20px_60px_rgba(0,0,0,0.34)] ring-1 ring-white/[0.025] sm:aspect-video sm:min-h-0 sm:rounded-xl sm:border xl:max-h-[calc(100dvh-10rem-env(safe-area-inset-top))]" : "aspect-video border-y border-white/12 shadow-[0_20px_60px_rgba(0,0,0,0.34)] ring-1 ring-white/[0.025] sm:rounded-xl sm:border xl:max-h-[calc(100dvh-10rem-env(safe-area-inset-top))]"}`}
        onMouseMove={showControls}
        onTouchStart={showControls}
      >
        {activeSource?.type === "youtube" ? <div ref={youTubePlayer.containerRef} className="absolute inset-0 h-full w-full" /> : null}
        {activeSource?.type === "google_drive" && driveLifecycle.mediaSrc ? (
          <video ref={drivePlayer.videoRef} src={driveLifecycle.mediaSrc} className="absolute inset-0 h-full w-full bg-black object-contain" playsInline preload="metadata" muted={localMuted} />
        ) : null}
        {activeSource && activeReady && !youTubeControlsMode ? (
          <button
            type="button"
            className="absolute inset-0 z-10 cursor-pointer bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#76e4c4]"
            onClick={handleVideoSurfaceClick}
            onDoubleClick={handleVideoSurfaceDoubleClick}
            aria-label="Show video controls"
          >
            <span className="sr-only">Show video controls</span>
          </button>
        ) : null}
        {showPlaybackUnlockOverlay ? (
          <button
            type="button"
            className="absolute inset-0 z-40 grid place-items-center bg-black/35 px-6 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#76e4c4]"
            onClick={() => void unlockPlaybackFromVideo()}
            aria-label="Tap once to synchronize playback"
          >
            <span className="rounded-lg border border-white/15 bg-black/75 px-4 py-2 text-sm font-semibold text-white shadow-xl">Tap once to sync</span>
          </button>
        ) : null}
        {activeSource?.type === "google_drive" && showDriveConnect ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-4 py-5 text-center sm:px-6">
            <div className="min-w-0 max-w-md">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Google Drive video selected</p>
              <h2 className="mt-3 line-clamp-2 break-words text-lg font-semibold sm:text-xl" title={activeSource.name}>{activeSource.name}</h2>
              <p className="mt-2 text-sm text-zinc-400">{formatFileSize(activeSource.size)} &middot; {activeSource.mimeType}</p>
              <p className="mt-3 text-sm text-zinc-500 sm:mt-4">Make sure this Drive file is shared with your friend&apos;s Google account.</p>
              <Button className="mt-4 w-full sm:mt-5 sm:w-auto" onClick={() => void connectDriveForCurrentSource()}>Connect Google Drive</Button>
              {driveError ? <p className="mt-3 text-sm text-red-300">{driveError}</p> : null}
            </div>
          </div>
        ) : null}
        {showDrivePreparing ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <p className="text-sm text-zinc-400">Preparing private Drive video...</p>
          </div>
        ) : null}
        {!activeSource ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-4 py-5 text-center sm:px-6">
            {isHost ? (
              <div className="w-full min-w-0 max-w-xl">
                <div className="mx-auto mb-4 grid w-full max-w-xs grid-cols-2 rounded-lg border border-white/10 bg-white/5 p-1 sm:mb-5">
                  <button className={`min-h-11 rounded-md px-3 text-sm ${sourceTab === "youtube" ? "bg-[#76e4c4] text-black" : "text-zinc-300"}`} onClick={() => setSourceTab("youtube")}>YouTube</button>
                  <button className={`min-h-11 rounded-md px-3 text-sm ${sourceTab === "google_drive" ? "bg-[#76e4c4] text-black" : "text-zinc-300"}`} onClick={() => setSourceTab("google_drive")}>Google Drive</button>
                </div>
                {sourceTab === "youtube" ? (
                  <>
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">YouTube source</p>
                    <h2 className="mt-2 text-xl font-semibold sm:mt-3 sm:text-2xl">Choose a video.</h2>
                    <div className="mt-4 grid gap-2 sm:mt-5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://youtube.com/watch?v=..." className="min-h-11 min-w-0 rounded-lg border border-white/10 bg-white/8 px-3 text-base text-white outline-none focus:border-[#76e4c4] sm:text-sm" />
                      <div className="grid grid-cols-2 gap-2 sm:contents">
                        <Button variant="secondary" onClick={() => navigator.clipboard?.readText().then(setUrl).catch(() => undefined)}><Clipboard className="h-4 w-4" />Paste</Button>
                        <Button onClick={() => void loadSource()}>Load video</Button>
                      </div>
                    </div>
                    {sourceError ? <p className="mt-3 text-sm text-red-300">{sourceError}</p> : null}
                  </>
                ) : (
                  <>
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Google Drive source</p>
                    <h2 className="mt-2 text-xl font-semibold sm:mt-3 sm:text-2xl">Choose a private Drive video.</h2>
                    <p className="mt-2 text-sm text-zinc-400">Uses {DRIVE_SCOPE}. The file must be shared with your friend.</p>
                    <Button className="mt-4 w-full sm:mt-5 sm:w-auto" disabled={!driveConfigured} onClick={() => void chooseDriveSource()}>Choose from Google Drive</Button>
                    {!driveConfigured ? <p className="mt-3 text-sm text-amber-200">Drive environment variables are missing.</p> : null}
                    {driveStatus ? <p className="mt-3 text-sm text-zinc-300">{driveStatus}</p> : null}
                    {driveError ? <p className="mt-3 text-sm text-red-300">{driveError}</p> : null}
                  </>
                )}
              </div>
            ) : (
              <div>
                <Avatar src={hostProfile?.avatar_url} name={hostProfile?.full_name ?? "Host"} className="mx-auto mb-4 h-14 w-14" />
                <h2 className="text-xl font-semibold sm:text-2xl">Waiting for host</h2>
                <p className="mt-2 text-sm text-zinc-500">{hostProfile?.full_name ?? "The host"} will choose the video.</p>
              </div>
            )}
          </div>
        ) : null}
        {statusOverlay ? (
          <div className="pointer-events-none absolute left-1/2 top-5 z-40 -translate-x-1/2 rounded-md bg-black/72 px-3 py-1.5 text-sm font-medium text-white shadow-lg" role="status">
            {statusOverlay}
          </div>
        ) : null}
        {youTubeControlsMode && activeSource?.type === "youtube" ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent p-3 sm:p-4">
            <div className="rounded-md bg-black/65 px-3 py-2 text-xs font-medium text-white">YouTube captions &amp; settings</div>
            <button
              type="button"
              className="pointer-events-auto grid h-11 min-w-11 place-items-center rounded-md bg-black/75 px-3 text-sm font-semibold text-white shadow-lg transition hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#76e4c4]"
              onClick={closeYouTubeControls}
              aria-label="Close YouTube captions and settings"
            >
              <X className="h-5 w-5 sm:hidden" />
              <span className="hidden sm:inline">Done</span>
            </button>
          </div>
        ) : null}
        <FlowingMessages messages={flowMessages} enabled={flowingEnabled} />
        {showPlayerControls ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-8 sm:px-4 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pt-12">
            {isHost ? (
              <div className="pointer-events-auto mb-1 flex items-center gap-2 sm:mb-2 sm:gap-3">
                <span className="w-9 text-right text-[11px] tabular-nums text-zinc-200 sm:w-10 sm:text-xs">{formatPlaybackTime(visibleCurrentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={seekMaximum}
                  step={0.1}
                  value={Math.min(visibleCurrentTime, seekMaximum)}
                  onChange={(event) => {
                    lastCommittedSeekRef.current = null;
                    setSeekDraft(Number(event.target.value));
                  }}
                  onPointerUp={(event) => commitHostSeek(Number(event.currentTarget.value))}
                  onKeyUp={(event) => commitHostSeek(Number(event.currentTarget.value))}
                  onBlur={(event) => commitHostSeek(Number(event.currentTarget.value))}
                  className="h-8 min-w-0 flex-1 touch-pan-y accent-[#76e4c4]"
                  aria-label="Seek synchronized video"
                />
                <span className="w-9 text-[11px] tabular-nums text-zinc-200 sm:w-10 sm:text-xs">{formatPlaybackDuration(displayTime.durationSeconds)}</span>
              </div>
            ) : (
              <ReadOnlyPlaybackProgress
                currentTimeSeconds={displayTime.currentTimeSeconds}
                durationSeconds={displayTime.durationSeconds}
              />
            )}
            <div className="pointer-events-auto grid grid-cols-[1fr_auto_1fr] items-center gap-1">
              <div className="flex min-w-0 items-center justify-start gap-1">
                <button
                  type="button"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-black/20 text-white transition hover:bg-white/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#76e4c4]"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleLocalMute();
                  }}
                  aria-label={localMuted ? "Unmute video" : "Mute video"}
                >
                  {localMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                {activeSource?.type === "youtube" ? (
                  <button
                    type="button"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-black/20 text-white transition hover:bg-white/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#76e4c4]"
                    onClick={(event) => {
                      event.stopPropagation();
                      openYouTubeControls();
                    }}
                    aria-label="Open YouTube captions and settings"
                  >
                    <Captions className="h-5 w-5" />
                  </button>
                ) : null}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={localMuted ? 0 : localVolume}
                  onChange={(event) => updateLocalVolume(Number(event.target.value))}
                  className="hidden h-6 w-20 accent-white lg:block"
                  aria-label="Local volume"
                />
              </div>
              <div className="flex items-center justify-center gap-1">
                {isHost ? (
                  <button
                    type="button"
                    className="relative grid h-11 w-11 place-items-center rounded-lg border border-white/[0.06] bg-black/20 text-white transition hover:bg-white/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#76e4c4]"
                    onClick={(event) => {
                      event.stopPropagation();
                      issueHostRelativeSeek(-10);
                    }}
                    aria-label="Rewind synchronized video 10 seconds"
                  >
                    <RotateCcw className="h-6 w-6" />
                    <span className="pointer-events-none absolute text-[9px] font-bold leading-none">10</span>
                  </button>
                ) : null}
                {isHost ? (
                  <button
                    type="button"
                    className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-white/10 text-white shadow-sm transition hover:bg-white/16 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#76e4c4]"
                    onClick={(event) => {
                      event.stopPropagation();
                      void (isLocalPlaying ? issueHostPause() : issueHostPlay());
                    }}
                    aria-label={isLocalPlaying ? "Pause synchronized video" : "Play synchronized video"}
                  >
                    {isLocalPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </button>
                ) : null}
                {isHost ? (
                  <button
                  type="button"
                  className="relative grid h-11 w-11 place-items-center rounded-lg border border-white/[0.06] bg-black/20 text-white transition hover:bg-white/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#76e4c4]"
                  onClick={(event) => {
                    event.stopPropagation();
                    issueHostRelativeSeek(10);
                  }}
                  aria-label="Forward synchronized video 10 seconds"
                >
                  <RotateCw className="h-6 w-6" />
                  <span className="pointer-events-none absolute text-[9px] font-bold leading-none">10</span>
                </button>
                ) : null}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center rounded-lg border border-white/[0.06] bg-black/20 text-white transition hover:bg-white/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#76e4c4]"
                  onClick={(event) => {
                    event.stopPropagation();
                    void togglePlayerFullscreen();
                  }}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {youTubePlayer.error ? <p className="mt-2 text-sm text-red-300">{youTubePlayer.error}</p> : null}
      {driveError && activeSource?.type === "google_drive" && driveLifecycle.mediaSrc ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-300">
          <span>{driveError}</span>
          <Button variant="secondary" onClick={() => driveAuth.reconnectRequired ? void connectDriveForCurrentSource() : void handleDriveMediaError({ mediaErrorCode: null }, true)}>{driveAuth.reconnectRequired ? "Reconnect Google Drive" : "Retry Drive video"}</Button>
        </div>
      ) : null}
    </section>
  );
}

function getScreenOrientation(): ScreenOrientationController | undefined {
  return typeof screen !== "undefined" && "orientation" in screen
    ? screen.orientation as unknown as ScreenOrientationController
    : undefined;
}
