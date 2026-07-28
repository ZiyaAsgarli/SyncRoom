import { z } from "zod";
import { supabase } from "../lib/supabase";
import type { AllowedGuest } from "../types/database";

const guestSchema = z.object({
  email: z.string().email(),
  is_active: z.boolean(),
  created_at: z.string()
});

const guestListSchema = z.array(guestSchema);

type GuestAccessRpc = {
  (fn: "list_allowed_guests"): Promise<{ data: unknown; error: Error | null }>;
  (fn: "add_allowed_guest", args: { email_input: string }): Promise<{ data: unknown; error: Error | null }>;
  (fn: "set_allowed_guest_active", args: { email_input: string; active_input: boolean }): Promise<{ data: unknown; error: Error | null }>;
};

const guestAccessRpc = supabase.rpc.bind(supabase) as unknown as GuestAccessRpc;

export async function listAllowedGuests(): Promise<AllowedGuest[]> {
  const { data, error } = await guestAccessRpc("list_allowed_guests");
  if (error) throw error;
  return guestListSchema.parse(data);
}

export async function addAllowedGuest(email: string): Promise<AllowedGuest> {
  const { data, error } = await guestAccessRpc("add_allowed_guest", { email_input: email });
  if (error) throw error;
  return guestSchema.parse(data);
}

export async function setAllowedGuestActive(email: string, active: boolean): Promise<AllowedGuest> {
  const { data, error } = await guestAccessRpc("set_allowed_guest_active", { email_input: email, active_input: active });
  if (error) throw error;
  return guestSchema.parse(data);
}
