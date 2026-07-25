import { z } from "zod";

export const messageSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, "Write a message first.").max(500, "Keep messages under 500 characters."));

export function validateMessageBody(value: string): { ok: true; body: string } | { ok: false; error: string } {
  const parsed = messageSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message." };
  }
  return { ok: true, body: parsed.data };
}

export function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
