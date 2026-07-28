export const MAX_GUEST_EMAIL_LENGTH = 254;

export type GuestEmailValidation =
  | { ok: true; email: string }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i;

export function normalizeGuestEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateGuestEmail(value: string, ownerEmail?: string | null): GuestEmailValidation {
  const email = normalizeGuestEmail(value);
  if (!email) return { ok: false, error: "Enter the guest's Google email." };
  if (email.length > MAX_GUEST_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid Google email address." };
  }
  if (ownerEmail && email === normalizeGuestEmail(ownerEmail)) {
    return { ok: false, error: "Your owner account cannot be added as a guest." };
  }
  return { ok: true, email };
}

export function canManageGuestAccess(privateRole: "owner" | "friend"): boolean {
  return privateRole === "owner";
}
