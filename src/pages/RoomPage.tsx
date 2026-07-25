import { Check, Copy, DoorOpen, MessageSquare, PhoneOff, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChatPanel } from "../components/chat/ChatPanel";
import { AppShell } from "../components/layout/AppShell";
import { PresenceList } from "../components/room/PresenceList";
import { YouTubeWatchStage } from "../components/room/YouTubeWatchStage";
import { Button } from "../components/ui/Button";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { ROUTES } from "../config/routes";
import { useAuth } from "../hooks/useAuth";
import { useRoomRealtime } from "../hooks/useRoomRealtime";
import { endPrivateRoom, getRoomById, leavePrivateRoom, sendMessage } from "../services/roomService";
import type { Room } from "../types/database";
import { copyStatusLabel, copyTextWithFallback, type CopyStatus } from "../utils/copyFeedback";
import { createOptimisticMessage, removeOptimisticMessage } from "../utils/chatMessages";

export function RoomPage() {
  const { roomId = "" } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [flowingEnabled, setFlowingEnabled] = useState(true);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const realtime = useRoomRealtime({ roomId: room?.id ?? null, userId: profile?.user_id ?? null, enabled: Boolean(room && profile) });

  useEffect(() => {
    let mounted = true;
    void getRoomById(roomId).then((found) => {
      if (!mounted) return;
      setRoom(found);
    }).catch((loadError: unknown) => {
      if (mounted) setError(loadError instanceof Error ? loadError.message : "Room could not be loaded.");
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [roomId]);

  const isHost = room?.host_user_id === profile?.user_id;
  const inviteLink = useMemo(() => room ? `${window.location.origin}${ROUTES.join(room.invite_code)}` : "", [room]);
  const hostProfile = useMemo(() => {
    const host = realtime.members.find((member) => member.user_id === room?.host_user_id);
    return host?.profiles ?? null;
  }, [realtime.members, room?.host_user_id]);

  async function handleSend(body: string) {
    if (!profile || !room) return;
    const optimistic = createOptimisticMessage({ room_id: room.id, user_id: profile.user_id, body }, profile);
    realtime.setMessages((messages) => [...messages, optimistic]);
    realtime.pushLiveFlowMessage(optimistic);
    try {
      const saved = await sendMessage(room.id, profile.user_id, body);
      realtime.setMessages((messages) => [...messages.filter((message) => message.id !== optimistic.id && message.id !== saved.id), saved]);
    } catch (sendError) {
      realtime.setMessages((messages) => removeOptimisticMessage(messages, optimistic.id));
      throw sendError;
    }
  }

  async function handleInviteCopy() {
    if (!inviteLink) return;
    const copied = await copyTextWithFallback(inviteLink);
    setCopyStatus(copied ? "copied" : "failed");
    window.setTimeout(() => setCopyStatus("idle"), 1800);
  }

  async function handleExit() {
    if (!room) return;
    if (isHost) {
      await endPrivateRoom(room.id);
    } else {
      await leavePrivateRoom(room.id);
    }
    navigate(ROUTES.dashboard);
  }

  if (loading) return <LoadingScreen label="Opening watch room..." />;
  if (!room || !profile) {
    return <AppShell><main className="mx-auto max-w-3xl px-4 py-12 text-white">{error ?? "Room not found."}</main></AppShell>;
  }

  return (
    <AppShell>
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-4 sm:px-6 lg:flex-row">
        <section className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101113]/80 p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs text-zinc-500"><Shield className="h-3.5 w-3.5" />Private two-person room</p>
              <h1 className="truncate text-lg font-semibold">{room.room_name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <PresenceList members={realtime.members} presence={realtime.presence} />
              <Button variant="secondary" className="h-10 px-3" onClick={() => void handleInviteCopy()} aria-label="Copy invitation link">
                {copyStatus === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="hidden sm:inline">{copyStatusLabel(copyStatus)}</span>
              </Button>
              <Button variant="secondary" className="h-10 px-3 lg:hidden" onClick={() => setChatOpen(true)} aria-label="Open chat"><MessageSquare className="h-4 w-4" /></Button>
              <Button variant={isHost ? "danger" : "ghost"} className="h-10 px-3" onClick={() => void handleExit()} aria-label={isHost ? "End room" : "Leave room"}>{isHost ? <PhoneOff className="h-4 w-4" /> : <DoorOpen className="h-4 w-4" />}<span className="hidden sm:inline">{isHost ? "End" : "Leave"}</span></Button>
            </div>
          </div>

          <YouTubeWatchStage room={room} currentProfile={profile} hostProfile={hostProfile} flowMessages={realtime.liveFlowMessages} flowingEnabled={flowingEnabled} />

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <button disabled className="min-h-12 rounded-lg border border-white/10 bg-white/5 px-4 text-left text-sm text-zinc-500">YouTube source · upcoming</button>
            <button disabled className="min-h-12 rounded-lg border border-white/10 bg-white/5 px-4 text-left text-sm text-zinc-500">Drive video · upcoming</button>
            <div className="min-h-12 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">Connection: {realtime.connectionState}</div>
          </div>

          {realtime.notice ? <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#101113] px-4 py-2 text-sm text-zinc-200 shadow-xl">{realtime.notice}</div> : null}
        </section>

        <ChatPanel
          open={chatOpen}
          room={room}
          messages={realtime.messages}
          currentProfile={profile}
          flowingEnabled={flowingEnabled}
          onFlowingChange={setFlowingEnabled}
          onClose={() => setChatOpen(false)}
          onSend={handleSend}
        />
      </main>
    </AppShell>
  );
}
