import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { RoomPlaybackState } from "../types/database";
import type { PlaybackEvent } from "../types/playback";
import { getRoomPlaybackSnapshot, setRoomDriveSource, setRoomYouTubeSource, updateRoomPlaybackState } from "../services/playbackService";
import type { DriveFileMetadata } from "../services/driveMetadata";
import {
  createPlaybackEvent,
  getPlaybackEventRejectionReason,
  isAuthoritativePlaybackEvent,
  isPlaybackEventAllowedOnChannel,
  parsePlaybackEvent,
  playbackChannelForEvent,
  type PlaybackChannelKind
} from "../utils/playbackEvents";
import {
  createSnapshotPersistenceState,
  didExceedSafeSnapshotWriteRate,
  markSnapshotWriteFailed,
  markSnapshotWriteStarted,
  markSnapshotWriteSucceeded,
  shouldSkipSnapshotPersistence
} from "../utils/playbackSnapshotPersistence";

interface UsePlaybackRoomChannelOptions {
  roomId: string;
  localUserId: string;
  hostUserId: string;
  isHost: boolean;
  onRemoteEvent: (event: PlaybackEvent) => void;
}

export function usePlaybackRoomChannel({ roomId, localUserId, hostUserId, isHost, onRemoteEvent }: UsePlaybackRoomChannelOptions) {
  const [snapshot, setSnapshot] = useState<RoomPlaybackState | null>(null);
  const [status, setStatus] = useState("Reconnecting");
  const [otherReady, setOtherReady] = useState(false);
  const authoritativeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const participantChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const seenEventIds = useRef<Set<string>>(new Set());
  const latestVersion = useRef(0);
  const lastEventAt = useRef<string | null>(null);
  const remoteCallback = useRef(onRemoteEvent);
  const snapshotPersistence = useRef(createSnapshotPersistenceState());
  const hasSnapshot = useRef(false);

  useEffect(() => {
    remoteCallback.current = onRemoteEvent;
  }, [onRemoteEvent]);

  useEffect(() => {
    let mounted = true;
    void getRoomPlaybackSnapshot(roomId).then((next) => {
      if (!mounted) return;
      setSnapshot(next);
      hasSnapshot.current = Boolean(next);
      latestVersion.current = next?.state_version ?? 0;
      snapshotPersistence.current = createSnapshotPersistenceState();
    }).catch(() => {
      if (import.meta.env.DEV) console.warn("[SyncRoom playback] snapshot load failed");
      setStatus("Snapshot unavailable");
    });

    const channelStatuses = { authoritative: false, participant: false };
    const receivePlaybackEvent = (channelKind: PlaybackChannelKind, payload: unknown) => {
        const event = parsePlaybackEvent(payload, roomId);
        if (!event) {
          if (import.meta.env.DEV) console.info("[SyncRoom playback] event rejected: malformed-or-wrong-room");
          return;
        }
        if (!isPlaybackEventAllowedOnChannel(event.type, channelKind)) {
          if (import.meta.env.DEV) console.info(`[SyncRoom playback] ${event.type} rejected: wrong-private-channel`);
          return;
        }
        const rejection = getPlaybackEventRejectionReason(event, { seenEventIds: seenEventIds.current, latestStateVersion: latestVersion.current, hostUserId, localUserId, latestEventSentAt: lastEventAt.current });
        if (rejection) {
          if (import.meta.env.DEV) console.info(`[SyncRoom playback] ${event.type} rejected: ${rejection}`);
          return;
        }
        if (import.meta.env.DEV && event.type === "playback:play") console.info("[SyncRoom playback] play event received and host verified");
        seenEventIds.current.add(event.eventId);
        latestVersion.current = Math.max(latestVersion.current, event.stateVersion);
        if (isAuthoritativePlaybackEvent(event.type)) lastEventAt.current = event.sentAt;
        if (event.type === "participant:ready" && event.senderUserId !== localUserId) setOtherReady(true);
        if (event.type === "source:set") setOtherReady(false);
        remoteCallback.current(event);
    };
    const handleStatus = (channelKind: PlaybackChannelKind, nextStatus: string) => {
        if (import.meta.env.DEV) console.info(`[SyncRoom playback:${roomId}:${channelKind}] ${nextStatus}`);
        if (nextStatus === "SUBSCRIBED") {
          channelStatuses[channelKind] = true;
          if (channelStatuses.authoritative && channelStatuses.participant) setStatus("In sync");
        }
        if (nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT") {
          channelStatuses[channelKind] = false;
          setStatus("Reconnecting");
          if (import.meta.env.DEV) console.warn(`[SyncRoom playback:${channelKind}] channel ${nextStatus.toLowerCase()}`);
        }
        if (nextStatus === "CLOSED") {
          channelStatuses[channelKind] = false;
          setStatus("Reconnecting");
        }
    };

    const authoritativeChannel = supabase.channel(`room:${roomId}:playback`, { config: { private: true } });
    const participantChannel = supabase.channel(`room:${roomId}:participant`, { config: { private: true } });
    authoritativeChannelRef.current = authoritativeChannel;
    participantChannelRef.current = participantChannel;
    authoritativeChannel.on("broadcast", { event: "playback" }, ({ payload }) => receivePlaybackEvent("authoritative", payload));
    participantChannel.on("broadcast", { event: "playback" }, ({ payload }) => receivePlaybackEvent("participant", payload));

    void supabase.realtime.setAuth().then(() => {
      if (!mounted) return;
      authoritativeChannel.subscribe((nextStatus) => handleStatus("authoritative", nextStatus));
      participantChannel.subscribe((nextStatus) => handleStatus("participant", nextStatus));
    }).catch(() => {
      if (!mounted) return;
      setStatus("Reconnecting");
      if (import.meta.env.DEV) console.warn("[SyncRoom playback] private channel authentication failed");
    });

    return () => {
      mounted = false;
      authoritativeChannelRef.current = null;
      participantChannelRef.current = null;
      hasSnapshot.current = false;
      snapshotPersistence.current = createSnapshotPersistenceState();
      void supabase.removeChannel(authoritativeChannel);
      void supabase.removeChannel(participantChannel);
    };
  }, [hostUserId, localUserId, roomId]);

  const broadcast = useCallback(async (event: Omit<PlaybackEvent, "eventId" | "sentAt" | "roomId" | "senderUserId">) => {
    const fullEvent = createPlaybackEvent({ ...event, roomId, senderUserId: localUserId });
    seenEventIds.current.add(fullEvent.eventId);
    latestVersion.current = Math.max(latestVersion.current, fullEvent.stateVersion);
    const channel = playbackChannelForEvent(fullEvent.type) === "authoritative"
      ? authoritativeChannelRef.current
      : participantChannelRef.current;
    await channel?.send({ type: "broadcast", event: "playback", payload: fullEvent });
    return fullEvent;
  }, [localUserId, roomId]);

  const broadcastPlaybackEvent = useCallback(async (event: Omit<PlaybackEvent, "eventId" | "sentAt" | "roomId" | "senderUserId">) => {
    return broadcast(event);
  }, [broadcast]);

  const chooseSource = useCallback(async (videoId: string) => {
    if (!isHost) throw new Error("Only the host can choose the video.");
    const next = await setRoomYouTubeSource(roomId, videoId);
    setSnapshot(next);
    hasSnapshot.current = true;
    latestVersion.current = next.state_version;
    snapshotPersistence.current = createSnapshotPersistenceState();
    setOtherReady(false);
    await broadcast({
      type: "source:set",
      stateVersion: next.state_version,
      videoId,
      sourceType: "youtube",
      currentTimeSeconds: 0,
      playbackRate: 1,
      playbackStatus: "cued"
    });
    return next;
  }, [broadcast, isHost, roomId]);

  const chooseDriveSource = useCallback(async (file: DriveFileMetadata) => {
    if (!isHost) throw new Error("Only the host can choose the video.");
    const next = await setRoomDriveSource(roomId, file);
    setSnapshot(next);
    hasSnapshot.current = true;
    latestVersion.current = next.state_version;
    snapshotPersistence.current = createSnapshotPersistenceState();
    setOtherReady(false);
    await broadcast({
      type: "source:set",
      sourceType: "google_drive",
      stateVersion: next.state_version,
      driveFileId: file.id,
      videoId: null,
      currentTimeSeconds: 0,
      playbackRate: 1,
      playbackStatus: "cued"
    });
    return next;
  }, [broadcast, isHost, roomId]);

  const persistAndBroadcast = useCallback(async (input: {
    playbackStatus: RoomPlaybackState["playback_status"];
    currentTimeSeconds: number;
    playbackRate: number;
    durationSeconds: number | null;
    eventType: PlaybackEvent["type"];
  }) => {
    if (!isHost) return null;
    const next = await updateRoomPlaybackState({
      roomId,
      expectedStateVersion: latestVersion.current,
      playbackStatus: input.playbackStatus,
      currentTimeSeconds: input.currentTimeSeconds,
      playbackRate: input.playbackRate,
      durationSeconds: input.durationSeconds,
      incrementStateVersion: true
    });
    setSnapshot(next);
    hasSnapshot.current = true;
    latestVersion.current = next.state_version;
    await broadcast({
      type: input.eventType,
      stateVersion: next.state_version,
      sourceType: next.source_type,
      driveFileId: next.drive_file_id,
      videoId: next.youtube_video_id,
      currentTimeSeconds: next.current_time_seconds,
      playbackRate: next.playback_rate,
      playbackStatus: next.playback_status
    });
    return next;
  }, [broadcast, isHost, roomId]);

  const persistSnapshot = useCallback(async (input: {
    playbackStatus: RoomPlaybackState["playback_status"];
    currentTimeSeconds: number;
    playbackRate: number;
    durationSeconds: number | null;
    sourceType: RoomPlaybackState["source_type"];
  }) => {
    const now = Date.now();
    const skipReason = shouldSkipSnapshotPersistence({
      state: snapshotPersistence.current,
      isHost,
      hasSource: hasSnapshot.current,
      isPlaying: input.playbackStatus === "playing",
      nowMs: now
    });
    if (skipReason) {
      if (import.meta.env.DEV && skipReason !== "not-playing") console.info("[SyncRoom playback] snapshot persistence skipped", { reason: skipReason, stateVersion: latestVersion.current, sourceType: input.sourceType, currentTime: Number(input.currentTimeSeconds.toFixed(2)) });
      return null;
    }

    snapshotPersistence.current = markSnapshotWriteStarted(snapshotPersistence.current, now);
    if (import.meta.env.DEV) {
      console.info("[SyncRoom playback] snapshot persistence requested", { stateVersion: latestVersion.current, sourceType: input.sourceType, currentTime: Number(input.currentTimeSeconds.toFixed(2)) });
      if (didExceedSafeSnapshotWriteRate(snapshotPersistence.current, now)) {
        console.warn("[SyncRoom playback] snapshot write rate exceeded safe development threshold");
      }
    }

    const expectedVersion = latestVersion.current;
    try {
      const next = await updateRoomPlaybackState({
        roomId,
        expectedStateVersion: expectedVersion,
        playbackStatus: input.playbackStatus,
        currentTimeSeconds: input.currentTimeSeconds,
        playbackRate: input.playbackRate,
        durationSeconds: input.durationSeconds,
        incrementStateVersion: false
      });
      setSnapshot(next);
      hasSnapshot.current = true;
      latestVersion.current = next.state_version;
      snapshotPersistence.current = markSnapshotWriteSucceeded(snapshotPersistence.current);
      if (import.meta.env.DEV) {
        const staleNoop = next.state_version !== expectedVersion;
        console.info(staleNoop ? "[SyncRoom playback] snapshot stale/no-op" : "[SyncRoom playback] snapshot persistence applied", { stateVersion: next.state_version, sourceType: next.source_type, currentTime: Number(next.current_time_seconds.toFixed(2)) });
      }
      return next;
    } catch {
      snapshotPersistence.current = markSnapshotWriteFailed(snapshotPersistence.current, Date.now());
      if (import.meta.env.DEV) {
        console.warn("[SyncRoom playback] snapshot failure", { stateVersion: expectedVersion, sourceType: input.sourceType });
        if (snapshotPersistence.current.suspendedUntilMs > Date.now()) console.warn("[SyncRoom playback] snapshot circuit breaker opened");
      }
      return null;
    }
  }, [isHost, roomId]);

  const sendReady = useCallback(async () => {
    await broadcast({ type: "participant:ready", stateVersion: latestVersion.current, videoId: snapshot?.youtube_video_id ?? null });
  }, [broadcast, snapshot?.youtube_video_id]);

  const sendSyncRequest = useCallback(async () => {
    await broadcast({ type: "playback:sync-request", stateVersion: latestVersion.current, videoId: snapshot?.youtube_video_id ?? null });
  }, [broadcast, snapshot?.youtube_video_id]);

  return { snapshot, setSnapshot, status, setStatus, otherReady, chooseSource, chooseDriveSource, persistAndBroadcast, persistSnapshot, broadcastPlaybackEvent, sendReady, sendSyncRequest, lastEventAt };
}
