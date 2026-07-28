import { supabase } from "../lib/supabase";
import type { Message, Profile, Room, RoomMember } from "../types/database";
import { normalizeInviteCode } from "../utils/inviteCode";

export interface RoomBundle {
  room: Room;
  members: RoomMember[];
  profiles: Profile[];
}

export interface RoomInviteBundle {
  room: Room;
  members: RoomMember[];
}

type RpcResult<T> = Promise<{ data: T; error: Error | null }>;
type RoomRpc = {
  (fn: "create_private_room", args: { room_name_input: string | null }): RpcResult<Room>;
  (fn: "join_private_room", args: { invite_code_input: string }): RpcResult<Room>;
  (fn: "leave_private_room", args: { room_id_input: string }): RpcResult<void>;
  (fn: "end_private_room", args: { room_id_input: string }): RpcResult<void>;
  (fn: "get_private_room_invite", args: { invite_code_input: string }): RpcResult<RoomInviteBundle | null>;
};

const roomRpc = supabase.rpc.bind(supabase) as unknown as RoomRpc;

export async function createPrivateRoom(roomName: string | null): Promise<Room> {
  const { data, error } = await roomRpc("create_private_room", { room_name_input: roomName });
  if (error) throw error;
  return data;
}

export async function joinPrivateRoom(inviteCode: string): Promise<Room> {
  const { data, error } = await roomRpc("join_private_room", { invite_code_input: normalizeInviteCode(inviteCode) });
  if (error) throw error;
  return data;
}

export async function leavePrivateRoom(roomId: string): Promise<void> {
  const { error } = await roomRpc("leave_private_room", { room_id_input: roomId });
  if (error) throw error;
}

export async function endPrivateRoom(roomId: string): Promise<void> {
  const { error } = await roomRpc("end_private_room", { room_id_input: roomId });
  if (error) throw error;
}

export async function getRoomById(roomId: string): Promise<Room | null> {
  const { data, error } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPrivateRoomInvite(inviteCode: string): Promise<RoomInviteBundle | null> {
  const { data, error } = await roomRpc("get_private_room_invite", { invite_code_input: normalizeInviteCode(inviteCode) });
  if (error) throw error;
  return data;
}

export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from("room_members")
    .select("*, profiles(*)")
    .eq("room_id", roomId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getMyRooms(userId: string): Promise<Room[]> {
  const { data: memberships, error: memberError } = await supabase
    .from("room_members")
    .select("room_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  if (memberError) throw memberError;
  const ids = [...new Set(((memberships ?? []) as Array<{ room_id: string }>).map((membership) => membership.room_id))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("rooms").select("*").in("id", ids).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getMessages(roomId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*, profiles(*)")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(roomId: string, userId: string, body: string): Promise<Message> {
  const messagesTable = supabase.from("messages") as unknown as {
    insert: (value: Pick<Message, "room_id" | "user_id" | "body">) => {
      select: (columns: string) => { single: () => Promise<{ data: Message; error: Error | null }> };
    };
  };
  const { data, error } = await messagesTable
    .insert({ room_id: roomId, user_id: userId, body })
    .select("*, profiles(*)")
    .single();
  if (error) throw error;
  return data;
}
