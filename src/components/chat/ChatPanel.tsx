import { Smile, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Message, Profile, Room } from "../../types/database";
import { FREQUENT_EMOJIS, insertAtCursor } from "../../utils/emoji";
import { formatMessageTime, validateMessageBody } from "../../utils/messages";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";

interface ChatPanelProps {
  room: Room;
  messages: Message[];
  currentProfile: Profile;
  flowingEnabled: boolean;
  onFlowingChange: (enabled: boolean) => void;
  onSend: (body: string) => Promise<void>;
}

export function ChatPanel({ room, messages, currentProfile, flowingEnabled, onFlowingChange, onSend }: ChatPanelProps) {
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
      className="room-chat-panel flex h-[clamp(20rem,45dvh,34rem)] min-h-0 w-full flex-col overscroll-contain border-y border-white/10 bg-[#101113]/98 text-white shadow-2xl sm:rounded-xl sm:border xl:h-auto xl:max-h-[calc(100dvh-10rem-env(safe-area-inset-top))] xl:self-stretch"
      aria-label="Room chat"
    >
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4">
        <div>
          <h2 className="font-semibold">Messages</h2>
          <label className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={flowingEnabled} onChange={(event) => onFlowingChange(event.target.checked)} className="accent-[#76e4c4]" />
            Flow over video
          </label>
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/12 p-4 text-sm text-zinc-400">No messages yet.</div>
        ) : messages.map((message) => {
          const profile = message.profiles ?? (message.user_id === currentProfile.user_id ? currentProfile : undefined);
          return (
            <article key={message.id} className="flex gap-3">
              <Avatar src={profile?.avatar_url} name={profile?.full_name ?? "Friend"} className="h-8 w-8 text-xs" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">{profile?.full_name ?? "Private user"}</span>
                  <time className="text-xs text-zinc-500">{formatMessageTime(message.created_at)}</time>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">{message.body}</p>
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
        className="shrink-0 border-t border-white/8 bg-[#101113] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
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
            className="min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-white/10 bg-black/24 px-3 py-2 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-[#76e4c4]/70 sm:text-sm"
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
              <div role="dialog" aria-label="Emoji picker" className="absolute bottom-13 right-0 z-50 grid w-[min(14rem,calc(100vw-2rem))] grid-cols-5 gap-1 rounded-xl border border-white/10 bg-[#141517] p-2 shadow-2xl">
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
