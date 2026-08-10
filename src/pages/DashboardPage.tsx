import { Copy, Link as LinkIcon, Plus, ShieldCheck, Video } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { GuestAccessPanel } from "../components/access/GuestAccessPanel";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { ROUTES } from "../config/routes";
import { useAuth } from "../hooks/useAuth";
import { createPrivateRoom, getMyRooms } from "../services/roomService";
import type { Room } from "../types/database";
import { canManageGuestAccess } from "../utils/guestAccess";
import { firstName } from "../utils/names";
import { roomStatusLabel } from "../utils/roomStatus";
import { userFacingError } from "../utils/userFacingError";

export function DashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!profile) return;
    void getMyRooms(profile.user_id).then(setRooms)
      .catch((loadError: unknown) => setError(userFacingError(loadError, "Dashboard could not load.")));
  }, [profile]);

  const activeRoom = useMemo(() => rooms.find((room) => room.status !== "ended"), [rooms]);
  const endedRooms = useMemo(() => rooms.filter((room) => room.status === "ended").slice(0, 4), [rooms]);
  const isOwner = canManageGuestAccess(profile?.private_role ?? "friend");

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const room = await createPrivateRoom(roomName);
      const invite = `${window.location.origin}${ROUTES.join(room.invite_code)}`;
      await navigator.clipboard?.writeText(invite).catch(() => undefined);
      navigate(ROUTES.room(room.id));
    } catch (createError) {
      setError(userFacingError(createError, "Room could not be created."));
    } finally {
      setCreating(false);
    }
  }

  if (!profile) return null;

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl overflow-x-clip px-3 py-5 sm:px-6 sm:py-8">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="surface-elevated p-4 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex items-center gap-3 sm:gap-4">
                <Avatar src={profile.avatar_url} name={profile.full_name} className="h-14 w-14" />
                <div className="min-w-0">
                  <p className="text-sm text-[var(--color-text-muted)]">Good to see you,</p>
                  <h1 className="truncate text-2xl font-semibold text-[var(--color-text)] sm:text-3xl" title={profile.full_name}>{firstName(profile.full_name)}</h1>
                </div>
              </div>
              {isOwner ? <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" />Create a private room</Button> : null}
            </div>
            {error ? <p className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
          </div>

          <div className="surface-section p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Private access</h2></div>
            <p className="mt-3 text-sm font-medium text-[var(--color-text-secondary)]">{isOwner ? "Owner account" : "Approved guest"}</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Rooms remain limited to the owner and one guest.</p>
          </div>
        </motion.section>

        {isOwner ? <GuestAccessPanel ownerEmail={profile.email} /> : null}

        <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="surface-section p-5">
            <h2 className="font-semibold">Current room</h2>
            {activeRoom ? (
              <div className="surface-interactive mt-4 flex flex-col gap-4 rounded-[var(--radius-control)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-lg font-semibold">{activeRoom.room_name}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{roomStatusLabel(activeRoom.status)} &middot; Invite {activeRoom.invite_code}</p>
                </div>
                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => navigate(ROUTES.room(activeRoom.id))}>Open room</Button>
              </div>
            ) : <p className="mt-4 text-sm text-[var(--color-text-muted)]">No active room yet. Start one when the moment feels right.</p>}
          </div>

          <div className="surface-section p-5">
            <h2 className="font-semibold">Watch sources</h2>
            <div className="mt-4 grid gap-3">
              <div className="flex min-h-12 items-center gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-white/[0.025] px-3 text-sm text-[var(--color-text-secondary)]"><Video className="h-4 w-4 text-[var(--color-accent)]" />YouTube playback</div>
              <div className="flex min-h-12 items-center gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-white/[0.025] px-3 text-sm text-[var(--color-text-secondary)]"><LinkIcon className="h-4 w-4 text-[var(--color-accent-secondary)]" />Google Drive video</div>
            </div>
          </div>
        </section>

        <section className="surface-section mt-6 p-5">
          <h2 className="font-semibold">Recent rooms</h2>
          {endedRooms.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {endedRooms.map((room) => <div key={room.id} className="min-w-0 rounded-lg border border-[var(--color-border-subtle)] bg-black/15 p-4"><p className="break-words font-medium text-[var(--color-text-secondary)]">{room.room_name}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{new Date(room.created_at).toLocaleDateString()}</p></div>)}
            </div>
          ) : <p className="mt-3 text-sm text-[var(--color-text-muted)]">Past watch nights will appear here.</p>}
        </section>
      </main>

      <Dialog title="Create private room" open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <p className="text-sm text-[var(--color-text-secondary)]">Each room supports the owner and one approved guest.</p>
        <label className="mt-5 block text-sm font-medium" htmlFor="room-name">Room name</label>
        <input id="room-name" value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={80} placeholder="Movie night" className="field-control mt-2 h-11 w-full px-3" />
        <Button onClick={handleCreate} disabled={creating} className="mt-5 w-full"><Copy className="h-4 w-4" />{creating ? "Creating..." : "Create room and copy invite"}</Button>
      </Dialog>
    </AppShell>
  );
}
