import { Check, Copy, DoorOpen, PhoneOff, Shield } from "lucide-react";
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
import { createOptimisticMessage, mergeConfirmedMessage, removeOptimisticMessage } from "../utils/chatMessages";

export function RoomPage() {
  const { roomId = "" } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flowingEnabled, setFlowingEnabled] = useState(true);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const realtime = useRoomRealtime({ roomId: room?.id ?? null, userId: profile?.user_id ?? null, currentProfile: profile, enabled: Boolean(room && profile) });

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
      realtime.setMessages((messages) => mergeConfirmedMessage(messages, saved));
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
      <main data-testid="room-layout" className="room-layout mx-auto flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] max-w-[1600px] flex-col gap-3 overflow-x-clip px-0 pb-[env(safe-area-inset-bottom)] pt-2 sm:min-h-[calc(100dvh-4rem-env(safe-area-inset-top))] sm:gap-4 sm:px-4 sm:py-3 xl:max-h-[calc(100dvh-4rem-env(safe-area-inset-top))] xl:min-h-0 xl:px-6">
        <header data-testid="room-header" className="surface-elevated mx-2 grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3.5 py-3 backdrop-blur-xl sm:mx-0 sm:px-4 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:gap-x-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)] sm:text-xs"><Shield className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />Private room</p>
            <h1 className="truncate text-base font-semibold text-[var(--color-text)] sm:text-lg" title={room.room_name}>{room.room_name}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 xl:col-start-3">
              <Button variant="secondary" className="h-11 w-11 p-0 md:w-auto md:px-3" onClick={() => void handleInviteCopy()} aria-label="Copy invitation link" title="Copy invitation link">
                {copyStatus === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="hidden md:inline">{copyStatusLabel(copyStatus)}</span>
              </Button>
              <Button variant={isHost ? "danger" : "ghost"} className="h-11 w-11 p-0 md:w-auto md:px-3" onClick={() => void handleExit()} aria-label={isHost ? "End room" : "Leave room"} title={isHost ? "End room" : "Leave room"}>{isHost ? <PhoneOff className="h-4 w-4" /> : <DoorOpen className="h-4 w-4" />}<span className="hidden md:inline">{isHost ? "End" : "Leave"}</span></Button>
          </div>
          <div className="col-span-2 mt-2 min-w-0 border-t border-[var(--color-border-subtle)] pt-2 xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:mt-0 xl:border-0 xl:pt-0">
            <PresenceList members={realtime.members} presence={realtime.presence} />
          </div>
        </header>

        <div data-testid="watch-row" className="grid min-h-0 min-w-0 grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,23rem)] xl:items-stretch">
          <section className="room-watch-column min-h-0 min-w-0">
            <YouTubeWatchStage room={room} currentProfile={profile} hostProfile={hostProfile} flowMessages={realtime.liveFlowMessages} flowingEnabled={flowingEnabled} />

            {realtime.connectionState !== "online" ? <div className="mx-3 mt-3 rounded-lg border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-sm text-amber-100 sm:mx-0">Reconnecting to the room...</div> : null}

            {realtime.notice ? <div className="fixed left-1/2 top-[calc(4rem+env(safe-area-inset-top))] z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-center text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-surface)]">{realtime.notice}</div> : null}
          </section>

          <ChatPanel
            room={room}
            messages={realtime.messages}
            members={realtime.members}
            currentProfile={profile}
            flowingEnabled={flowingEnabled}
            onFlowingChange={setFlowingEnabled}
            onSend={handleSend}
          />
        </div>
      </main>
    </AppShell>
  );
}
