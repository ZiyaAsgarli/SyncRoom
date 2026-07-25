import { Copy, Link as LinkIcon, Plus, Video } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { ROUTES } from "../config/routes";
import { useAuth } from "../hooks/useAuth";
import { createPrivateRoom, getAllowedProfiles, getMyRooms } from "../services/roomService";
import type { Profile, Room } from "../types/database";
import { firstName } from "../utils/names";
import { roomStatusLabel } from "../utils/roomStatus";

export function DashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!profile) return;
    void Promise.all([getMyRooms(profile.user_id), getAllowedProfiles()]).then(([nextRooms, nextProfiles]) => {
      setRooms(nextRooms);
      setProfiles(nextProfiles);
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Dashboard could not load."));
  }, [profile]);

  const activeRoom = useMemo(() => rooms.find((room) => room.status !== "ended"), [rooms]);
  const endedRooms = useMemo(() => rooms.filter((room) => room.status === "ended").slice(0, 4), [rooms]);
  const friend = profiles.find((item) => item.user_id !== profile?.user_id);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const room = await createPrivateRoom(roomName);
      const invite = `${window.location.origin}${ROUTES.join(room.invite_code)}`;
      await navigator.clipboard?.writeText(invite).catch(() => undefined);
      navigate(ROUTES.room(room.id));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Room could not be created.");
    } finally {
      setCreating(false);
    }
  }

  if (!profile) return null;

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl overflow-x-clip px-3 py-5 sm:px-6 sm:py-8">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="rounded-xl border border-white/10 bg-white/[0.055] p-4 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex items-center gap-3 sm:gap-4">
                <Avatar src={profile.avatar_url} name={profile.full_name} className="h-14 w-14" />
                <div className="min-w-0">
                  <p className="text-sm text-zinc-400">Good to see you,</p>
                  <h1 className="truncate text-2xl font-semibold sm:text-3xl" title={profile.full_name}>{firstName(profile.full_name)}</h1>
                </div>
              </div>
              <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" />Create a private room</Button>
            </div>
            {error ? <p className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.055] p-5">
            <h2 className="font-semibold">Friend status</h2>
            {friend ? (
              <div className="mt-4 flex items-center gap-3">
                <Avatar src={friend.avatar_url} name={friend.full_name} />
                <div className="min-w-0">
                  <p className="truncate font-medium" title={friend.full_name}>{friend.full_name}</p>
                  <p className="text-sm text-zinc-500">Invited account ready</p>
                </div>
              </div>
            ) : <p className="mt-3 text-sm text-zinc-400">Their profile appears after their first approved Google sign-in.</p>}
          </div>
        </motion.section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="rounded-xl border border-white/10 bg-[#101113]/86 p-5">
            <h2 className="font-semibold">Current room</h2>
            {activeRoom ? (
              <div className="mt-4 flex flex-col gap-4 rounded-lg border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-lg font-semibold">{activeRoom.room_name}</p>
                  <p className="mt-1 text-sm text-zinc-500">{roomStatusLabel(activeRoom.status)} · Invite {activeRoom.invite_code}</p>
                </div>
                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => navigate(ROUTES.room(activeRoom.id))}>Open room</Button>
              </div>
            ) : <p className="mt-4 text-sm text-zinc-400">No active room. Create one when you are ready.</p>}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#101113]/86 p-5">
            <h2 className="font-semibold">Upcoming sources</h2>
            <div className="mt-4 grid gap-3">
              <button disabled className="flex min-h-12 items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 text-left text-sm text-zinc-400"><Video className="h-4 w-4" />YouTube playback</button>
              <button disabled className="flex min-h-12 items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 text-left text-sm text-zinc-400"><LinkIcon className="h-4 w-4" />Google Drive video</button>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-white/10 bg-[#101113]/70 p-5">
          <h2 className="font-semibold">Recent ended rooms</h2>
          {endedRooms.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {endedRooms.map((room) => <div key={room.id} className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-4"><p className="break-words font-medium">{room.room_name}</p><p className="mt-1 text-xs text-zinc-500">{new Date(room.created_at).toLocaleDateString()}</p></div>)}
            </div>
          ) : <p className="mt-3 text-sm text-zinc-400">Ended rooms will appear here.</p>}
        </section>
      </main>

      <Dialog title="Create private room" open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <p className="text-sm text-zinc-400">Each room supports only two approved Google accounts.</p>
        <label className="mt-5 block text-sm font-medium" htmlFor="room-name">Room name</label>
        <input id="room-name" value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={80} placeholder="Movie night" className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/24 px-3 text-white outline-none focus:border-[#76e4c4]/70" />
        <Button onClick={handleCreate} disabled={creating} className="mt-5 w-full"><Copy className="h-4 w-4" />{creating ? "Creating..." : "Create room and copy invite"}</Button>
      </Dialog>
    </AppShell>
  );
}
