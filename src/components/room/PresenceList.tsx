import type { Profile, RoomMember } from "../../types/database";
import { firstName } from "../../utils/names";
import { Avatar } from "../ui/Avatar";

export type PresenceState = "online" | "away" | "left" | "reconnecting";

export interface PresenceMeta {
  user_id: string;
  online_at: string;
  state: PresenceState;
}

export function PresenceList({ members, presence }: { members: RoomMember[]; presence: Record<string, PresenceMeta> }) {
  return (
    <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      {members.map((member) => {
        const profile = member.profiles as Profile | undefined;
        const state = presence[member.user_id]?.state ?? "left";
        return (
          <div key={member.user_id} className="flex min-w-0 items-center gap-2 rounded-full border border-white/12 bg-white/[0.055] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:max-w-52">
            <span className="relative shrink-0">
              <Avatar src={profile?.avatar_url} name={profile?.full_name ?? "Private user"} className="h-8 w-8 text-xs" />
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#101113] ${state === "online" ? "bg-[#76e4c4] shadow-[0_0_8px_rgba(118,228,196,0.45)]" : state === "reconnecting" ? "bg-amber-300" : state === "away" ? "bg-zinc-400" : "bg-zinc-700"}`} />
            </span>
            <span className="min-w-0 text-[11px] sm:text-xs">
              <span className="block truncate font-semibold text-white">{firstName(profile?.full_name ?? "Friend")}</span>
              <span className="block truncate capitalize text-zinc-400">{member.member_role} · {state}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
