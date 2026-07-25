export const FREQUENT_EMOJIS = ["😀", "😂", "😍", "🥹", "😭", "❤️", "🔥", "👀", "👍", "👎", "🎬", "🍿", "🤣", "😮", "😴"] as const;

export function insertAtCursor(value: string, insertion: string, start: number, end = start): { value: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));
  const next = `${value.slice(0, safeStart)}${insertion}${value.slice(safeEnd)}`;
  return { value: next, cursor: safeStart + insertion.length };
}
