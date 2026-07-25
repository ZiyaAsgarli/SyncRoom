export function firstName(nameOrEmail: string): string {
  const clean = nameOrEmail.trim();
  if (!clean) return "Friend";
  return clean.split(/\s|@/)[0] ?? clean;
}

export function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return cleanInitial(nameOrEmail).slice(0, 2).toUpperCase();
}

function cleanInitial(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "") || "SR";
}
