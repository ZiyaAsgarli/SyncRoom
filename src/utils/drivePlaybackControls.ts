export function isAutoplayPolicyError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}
