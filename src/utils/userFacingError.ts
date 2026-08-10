const SAFE_SERVER_MESSAGES = new Set([
  "Enter a valid Google email address",
  "The owner cannot be added as a guest",
  "That email belongs to the private owner",
  "Approved guest not found",
  "Only the private owner can create a room",
  "Room name is too long",
  "Room invitation not found",
  "This room has ended",
  "This room is already full",
  "This invitation requires the private owner and an approved guest"
]);

export function userFacingError(error: unknown, fallback: string): string {
  const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : null;
  return message && SAFE_SERVER_MESSAGES.has(message) ? message : fallback;
}
