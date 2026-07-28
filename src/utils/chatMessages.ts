import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Message, Profile, RoomMember } from "../types/database";

const OPTIMISTIC_PREFIX = "optimistic-";
const OPTIMISTIC_REPLACE_WINDOW_MS = 15_000;

export function createOptimisticMessage(input: Pick<Message, "room_id" | "user_id" | "body">, profile: Message["profiles"]): Message {
  return {
    id: `${OPTIMISTIC_PREFIX}${crypto.randomUUID()}`,
    room_id: input.room_id,
    user_id: input.user_id,
    body: input.body,
    created_at: new Date().toISOString(),
    profiles: profile
  };
}

export function isOptimisticMessage(message: Pick<Message, "id">): boolean {
  return message.id.startsWith(OPTIMISTIC_PREFIX);
}

export function parseMessageInsertPayload(payload: RealtimePostgresChangesPayload<Record<string, unknown>>, roomId: string): Message | null {
  const candidate = payload.new as Record<string, unknown> | null;
  if (!candidate || typeof candidate !== "object") return null;
  if (candidate.room_id !== roomId) return null;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.room_id !== "string" ||
    typeof candidate.user_id !== "string" ||
    typeof candidate.body !== "string" ||
    typeof candidate.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: candidate.id,
    room_id: candidate.room_id,
    user_id: candidate.user_id,
    body: candidate.body,
    created_at: candidate.created_at
  };
}

export function mergeConfirmedMessage(existing: Message[], incoming: Message): Message[] {
  if (existing.some((message) => message.id === incoming.id)) return existing;
  const incomingTime = Date.parse(incoming.created_at);
  const optimisticIndex = existing.findIndex((message) => {
    if (!isOptimisticMessage(message)) return false;
    if (message.user_id !== incoming.user_id || message.body !== incoming.body) return false;
    const optimisticTime = Date.parse(message.created_at);
    return Number.isFinite(incomingTime) && Number.isFinite(optimisticTime)
      ? Math.abs(incomingTime - optimisticTime) <= OPTIMISTIC_REPLACE_WINDOW_MS
      : true;
  });

  if (optimisticIndex >= 0) {
    return existing.map((message, index) => index === optimisticIndex ? { ...incoming, profiles: message.profiles ?? incoming.profiles } : message);
  }

  return [...existing, incoming].sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
}

export function removeOptimisticMessage(existing: Message[], optimisticId: string): Message[] {
  return existing.filter((message) => message.id !== optimisticId);
}

export function shouldFlowLiveMessage(message: Message, baselineIds: ReadonlySet<string>, subscriptionReady: boolean): boolean {
  return subscriptionReady && !baselineIds.has(message.id);
}

export function createFlowSignature(message: Pick<Message, "user_id" | "body" | "created_at">): string {
  const bucket = Math.floor(Date.parse(message.created_at) / 10_000);
  return `${message.user_id}:${bucket}:${message.body}`;
}

export function resolveMessageProfile(message: Message, members: readonly RoomMember[], currentProfile?: Profile | null): Profile | undefined {
  if (hasDisplayName(message.profiles)) return message.profiles;
  if (currentProfile?.user_id === message.user_id && hasDisplayName(currentProfile)) return currentProfile;
  const memberProfile = members.find((member) => member.user_id === message.user_id)?.profiles;
  if (hasDisplayName(memberProfile)) return memberProfile;
  return message.profiles ?? memberProfile;
}

export function hydrateMessageProfiles(messages: readonly Message[], members: readonly RoomMember[], currentProfile?: Profile | null): Message[] {
  return messages.map((message) => {
    const profile = resolveMessageProfile(message, members, currentProfile);
    return profile && profile !== message.profiles ? { ...message, profiles: profile } : message;
  });
}

export function messageSenderName(profile?: Profile | null, fallback = "Private user"): string {
  const displayName = profile?.full_name?.trim();
  return displayName || fallback;
}

function hasDisplayName(profile?: Profile | null): profile is Profile {
  return Boolean(profile?.full_name?.trim());
}
