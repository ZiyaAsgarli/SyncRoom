import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getMessages, getRoomMembers } from "../services/roomService";
import type { Message, Profile, RoomMember } from "../types/database";
import type { PresenceMeta, PresenceState } from "../components/room/PresenceList";
import { createFlowSignature, hydrateMessageProfiles, mergeConfirmedMessage, parseMessageInsertPayload, resolveMessageProfile, shouldFlowLiveMessage } from "../utils/chatMessages";

interface UseRoomRealtimeOptions {
  roomId: string | null;
  userId: string | null;
  currentProfile: Profile | null;
  enabled: boolean;
}

export function useRoomRealtime({ roomId, userId, currentProfile, enabled }: UseRoomRealtimeOptions) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [liveFlowMessages, setLiveFlowMessages] = useState<Message[]>([]);
  const [presence, setPresence] = useState<Record<string, PresenceMeta>>({});
  const [connectionState, setConnectionState] = useState<PresenceState>("reconnecting");
  const [notice, setNotice] = useState<string | null>(null);
  const baselineIds = useRef<Set<string>>(new Set());
  const subscriptionReady = useRef(false);
  const flowedSignatures = useRef<Set<string>>(new Set());
  const membersRef = useRef<RoomMember[]>([]);
  const currentProfileRef = useRef<Profile | null>(currentProfile);
  currentProfileRef.current = currentProfile;

  const enrichMessage = useCallback((message: Message): Message => {
    const profile = resolveMessageProfile(message, membersRef.current, currentProfileRef.current);
    return profile ? { ...message, profiles: profile } : message;
  }, []);

  const applyMembers = useCallback((nextMembers: RoomMember[]) => {
    membersRef.current = nextMembers;
    setMembers(nextMembers);
    setMessages((current) => hydrateMessageProfiles(current, nextMembers, currentProfileRef.current));
    setLiveFlowMessages((current) => hydrateMessageProfiles(current, nextMembers, currentProfileRef.current));
  }, []);

  const pushLiveFlowMessage = useCallback((message: Message) => {
    const enriched = enrichMessage(message);
    const signature = createFlowSignature(enriched);
    if (flowedSignatures.current.has(signature)) return;
    flowedSignatures.current.add(signature);
    setLiveFlowMessages((items) => [...items.slice(-20), enriched]);
  }, [enrichMessage]);

  useEffect(() => {
    if (!enabled || !roomId || !userId || userId === "anonymous") return;
    let mounted = true;
    baselineIds.current = new Set();
    subscriptionReady.current = false;
    flowedSignatures.current = new Set();
    setMessages([]);
    setLiveFlowMessages([]);
    membersRef.current = [];
    setMembers([]);

    void Promise.all([getRoomMembers(roomId), getMessages(roomId)]).then(([nextMembers, nextMessages]) => {
      if (!mounted) return;
      membersRef.current = nextMembers;
      setMembers(nextMembers);
      setMessages((current) => hydrateMessageProfiles(
        nextMessages.reduce((merged, message) => mergeConfirmedMessage(merged, message), current),
        nextMembers,
        currentProfileRef.current
      ));
      setLiveFlowMessages((current) => hydrateMessageProfiles(current, nextMembers, currentProfileRef.current));
      baselineIds.current = new Set(nextMessages.map((message) => message.id));
    }).catch((error: unknown) => {
      console.error("Room realtime initial load failed", error);
    });

    const channel = supabase.channel(`room:${roomId}`, { config: { presence: { key: userId } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceMeta>();
        const flattened = Object.entries(state).reduce<Record<string, PresenceMeta>>((acc, [key, metas]) => {
          const latest = metas[metas.length - 1];
          if (latest) acc[key] = latest;
          return acc;
        }, {});
        setPresence(flattened);
        setConnectionState("online");
      })
      .on("presence", { event: "join" }, ({ key }) => {
        if (key !== userId) {
          setNotice("Your friend entered the room.");
          window.setTimeout(() => setNotice(null), 2800);
        }
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key !== userId) {
          setNotice("Your friend left the room.");
          window.setTimeout(() => setNotice(null), 2800);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` }, (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const inserted = parseMessageInsertPayload(payload, roomId);
        if (!inserted) {
          console.error("Ignored malformed or wrong-room message realtime payload", payload);
          return;
        }
        const live = shouldFlowLiveMessage(inserted, baselineIds.current, subscriptionReady.current);
        setMessages((current) => mergeConfirmedMessage(current, enrichMessage(inserted)));
        if (live && inserted.user_id !== userId) pushLiveFlowMessage(inserted);
        if (inserted.user_id !== userId) setConnectionState("online");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` }, () => {
        void getRoomMembers(roomId).then(applyMembers);
      })
      .subscribe(async (status) => {
        if (import.meta.env.DEV) console.info(`[SyncRoom realtime:${roomId}] ${status}`);
        if (status === "SUBSCRIBED") {
          subscriptionReady.current = true;
          setConnectionState("online");
          await channel.track({ user_id: userId, online_at: new Date().toISOString(), state: "online" satisfies PresenceState });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          subscriptionReady.current = false;
          setConnectionState("reconnecting");
          console.error(`Room realtime channel ${status.toLowerCase()} for room ${roomId}`);
        } else if (status === "CLOSED") {
          subscriptionReady.current = false;
          setConnectionState("left");
        }
      });

    const away = () => {
      const nextState: PresenceState = document.hidden ? "away" : "online";
      setConnectionState(nextState);
      void channel.track({ user_id: userId, online_at: new Date().toISOString(), state: nextState });
    };
    document.addEventListener("visibilitychange", away);

    return () => {
      mounted = false;
      subscriptionReady.current = false;
      document.removeEventListener("visibilitychange", away);
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [applyMembers, enabled, enrichMessage, pushLiveFlowMessage, roomId, userId]);

  return { members, messages, setMessages, liveFlowMessages, pushLiveFlowMessage, presence, connectionState, notice };
}
