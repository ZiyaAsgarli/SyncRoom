import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types/database";
import { createProfileSyncCoordinator } from "./profileSyncCoordinator";
import { createSingleFlight } from "../utils/singleFlight";

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = `${window.location.origin}/`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "online",
        prompt: "select_account"
      }
    }
  });
  if (error) throw error;
}

export const signOut = createSingleFlight(async (): Promise<void> => {
  await supabase.auth.signOut().then(() => undefined).catch((error: unknown) => {
    const status = error && typeof error === "object" && "status" in error ? (error as { status?: number }).status : undefined;
    if (status !== 403) throw error;
  });
});

export async function syncPrivateProfile(): Promise<Profile> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: "sync_private_profile",
    args?: undefined
  ) => Promise<{ data: Profile; error: Error | null }>;
  const { data, error } = await rpc("sync_private_profile", undefined);
  if (error) throw error;
  return data;
}

export async function checkPrivateAccess(): Promise<"owner" | "guest"> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: "check_private_access",
    args?: undefined
  ) => Promise<{ data: "owner" | "guest"; error: Error | null }>;
  const { data, error } = await rpc("check_private_access", undefined);
  if (error) throw error;
  return data;
}

export const privateProfileSync = createProfileSyncCoordinator(syncPrivateProfile);

export function userEmail(user: User | null): string | null {
  return user?.email?.toLowerCase() ?? null;
}
