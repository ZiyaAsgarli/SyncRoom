export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isInviteCodeLike(value: string): boolean {
  return /^[A-Z0-9]{6,10}$/.test(normalizeInviteCode(value));
}
