import { ArrowRight, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { ROUTES } from "../config/routes";
import { useAuth } from "../hooks/useAuth";
import { getPrivateRoomInvite, joinPrivateRoom } from "../services/roomService";
import type { Room, RoomMember } from "../types/database";
import { normalizeInviteCode } from "../utils/inviteCode";
import { canJoinRoom } from "../utils/roomStatus";

export function JoinRoomPage() {
  const { inviteCode = "" } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanCode = normalizeInviteCode(inviteCode);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const invite = await getPrivateRoomInvite(cleanCode);
        if (!mounted) return;
        if (!invite) {
          setError("That invitation code is not valid.");
          setRoom(null);
          return;
        }
        setRoom(invite.room);
        setMembers(invite.members);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Invitation could not be loaded.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [cleanCode]);

  async function handleJoin() {
    setJoining(true);
    setError(null);
    try {
      const joined = await joinPrivateRoom(cleanCode);
      navigate(ROUTES.room(joined.id), { replace: true });
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Room could not be joined.");
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <LoadingScreen label="Checking private invitation..." />;

  const host = members.find((member) => member.member_role === "host");
  const isHost = room?.host_user_id === profile?.user_id;
  const alreadyJoined = members.some((member) => member.user_id === profile?.user_id);
  const joinable = room ? canJoinRoom(room.status, members.length) || alreadyJoined || isHost : false;

  return (
    <AppShell>
      <main className="mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-3xl place-items-center px-3 py-5 sm:px-4 sm:py-10">
        <section className="surface-elevated w-full min-w-0 p-4 text-[var(--color-text)] sm:p-6">
          <p className="eyebrow">Private invite {cleanCode}</p>
          {room ? (
            <>
              <h1 className="mt-3 break-words text-2xl font-semibold sm:text-3xl">{room.room_name}</h1>
              <div className="surface-interactive mt-5 flex items-center gap-3 rounded-lg p-4">
                <Avatar src={host?.profiles?.avatar_url} name={host?.profiles?.full_name ?? "Host"} />
                <div>
                  <p className="font-medium">{host?.profiles?.full_name ?? "Host"}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Host</p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">One approved guest can join the owner in this room. Room capacity is two people.</p>
              {isHost ? <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">You are the host for this invite. Opening the room will take you back inside.</p> : null}
              {!joinable ? <p className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">This room is ended or already full.</p> : null}
              <Button onClick={isHost || alreadyJoined ? () => navigate(ROUTES.room(room.id)) : handleJoin} disabled={joining || !joinable} className="mt-6 w-full">
                <ArrowRight className="h-4 w-4" />{isHost || alreadyJoined ? "Open room" : joining ? "Joining..." : "Join room"}
              </Button>
            </>
          ) : (
            <div className="mt-5 rounded-lg border border-red-400/20 bg-red-500/10 p-4 text-red-100">
              <ShieldAlert className="mb-3 h-5 w-5" />
              {error ?? "Invitation could not be opened."}
            </div>
          )}
          {error && room ? <p className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
        </section>
      </main>
    </AppShell>
  );
}
