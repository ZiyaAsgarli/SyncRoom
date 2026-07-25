import type { RoomStatus } from "../types/database";

export function canJoinRoom(status: RoomStatus, activeMembers: number): boolean {
  return status !== "ended" && activeMembers < 2;
}

export function isRoomEnded(status: RoomStatus): boolean {
  return status === "ended";
}

export function roomStatusLabel(status: RoomStatus): string {
  if (status === "waiting") return "Waiting";
  if (status === "active") return "Active";
  return "Ended";
}
