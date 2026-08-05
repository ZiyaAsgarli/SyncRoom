import { Smile, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Message, Profile, Room, RoomMember } from "../../types/database";
import { FREQUENT_EMOJIS, insertAtCursor } from "../../utils/emoji";
import { formatMessageTime, validateMessageBody } from "../../utils/messages";
import { messageSenderName, resolveMessageProfile } from "../../utils/chatMessages";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";

interface ChatPanelProps {
  room: Room;
  messages: Message[];
  members: RoomMember[];
  currentProfile: Profile;
  flowingEnabled: boolean;
  onFlowingChange: (enabled: boolean) => void;
  onSend: (body: string) => Promise<void>;
}

export function ChatPanel({ room, messages, members, currentProfile, flowingEnabled, onFlowingChange, onSend }: ChatPanelProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const ended = room.status === "ended";

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distance < 80) {
      node.scrollTop = node.scrollHeight;
      setNewCount(0);
    } else if (messages.length > 0) {
      setNewCount((count) => count + 1);
    }
  }, [messages]);

  useEffect(() => {
    if (!emojiOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (emojiRef.current?.contains(event.target as Node)) return;
      setEmojiOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEmojiOpen(false);
        textareaRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [emojiOpen]);

  async function submit() {
    const parsed = validateMessageBody(body);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSending(true);
    try {
      await onSend(parsed.body);
      setBody("");
      setEmojiOpen(false);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <aside
      data-testid="room-chat"
      className="room-chat-panel surface-elevated flex h-[clamp(20rem,45dvh,34rem)] min-h-0 w-full flex-col overscroll-contain rounded-none border-x-0 text-[var(--color-text)] sm:rounded-[var(--radius-surface)] sm:border-x xl:h-auto xl:max-h-[calc(100dvh-10rem-env(safe-area-inset-top))] xl:self-stretch"
      aria-label="Room chat"
    >
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4">
        <div>
          <h2 className="font-semibold">Messages</h2>
          <label className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <input type="checkbox" checked={flowingEnabled} onChange={(event) => onFlowingChange(event.target.checked)} className="accent-[var(--color-accent)]" />
            Flow over video
          </label>
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3.5 py-4 sm:px-4">
        {messages.length === 0 ? (
          <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-sm text-[var(--color-text-muted)]">Your conversation will appear here.</div>
        ) : messages.map((message) => {
          const profile = resolveMessageProfile(message, members, currentProfile);
          const senderName = messageSenderName(profile);
          return (
            <article key={message.id} className="group flex gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.035]">
              <Avatar src={profile?.avatar_url} name={senderName} className="h-8 w-8 text-xs ring-1 ring-white/10" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold text-[var(--color-text)]">{senderName}</span>
                  <time className="shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">{formatMessageTime(message.created_at)}</time>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-text-secondary)]">{message.body}</p>
              </div>
            </article>
          );
        })}
      </div>

      {newCount > 0 ? (
        <button
          className="mx-4 mb-2 rounded-full border border-[#76e4c4]/30 bg-[#76e4c4]/12 px-3 py-2 text-xs font-semibold text-[#b7f7de]"
          onClick={() => {
            if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
            setNewCount(0);
          }}
        >
          {newCount} new message{newCount === 1 ? "" : "s"}
        </button>
      ) : null}

      <form
        className="shrink-0 border-t border-[var(--color-border-subtle)] bg-black/12 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="message" className="sr-only">Message</label>
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            id="message"
            rows={2}
            value={body}
            disabled={ended}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={ended ? "Room has ended" : "Message"}
            className="field-control min-h-11 min-w-0 flex-1 resize-none px-3 py-2 text-base shadow-inner sm:text-sm"
          />
          <div ref={emojiRef} className="relative">
            <Button
              type="button"
              variant="secondary"
              disabled={ended}
              className="h-11 w-11 p-0"
              aria-label="Insert emoji"
              aria-expanded={emojiOpen}
              onClick={() => setEmojiOpen((value) => !value)}
            >
              <Smile className="h-4 w-4" />
            </Button>
            {emojiOpen ? (
              <div role="dialog" aria-label="Emoji picker" className="surface-elevated absolute bottom-13 right-0 z-50 grid w-[min(14rem,calc(100vw-2rem))] grid-cols-5 gap-1 p-2 shadow-[var(--shadow-elevated)]">
                {FREQUENT_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-lg text-lg transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#76e4c4]"
                    onClick={() => {
                      const node = textareaRef.current;
                      const next = insertAtCursor(body, emoji, node?.selectionStart ?? body.length, node?.selectionEnd ?? body.length);
                      setBody(next.value);
                      window.requestAnimationFrame(() => {
                        textareaRef.current?.focus();
                        textareaRef.current?.setSelectionRange(next.cursor, next.cursor);
                      });
                    }}
                  >
                    <span aria-hidden="true">{emoji}</span>
                    <span className="sr-only">Insert {emoji}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Button type="submit" disabled={sending || ended} className="h-11 w-11 p-0" aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      </form>
    </aside>
  );
}
