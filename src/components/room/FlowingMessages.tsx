import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "../../types/database";
import { firstName } from "../../utils/names";
import { messageSenderName } from "../../utils/chatMessages";
import { Avatar } from "../ui/Avatar";
import { assignFlowingLane, maxLanesForWidth } from "./flowingEngine";
import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";

interface ActiveFlowMessage {
  message: Message;
  lane: number;
  key: string;
}

export function FlowingMessages({ messages, enabled }: { messages: Message[]; enabled: boolean }) {
  const reducedMotion = useReducedMotionPreference();
  const [active, setActive] = useState<ActiveFlowMessage[]>([]);
  const laneAvailableAt = useRef<number[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<Set<number>>(new Set());
  const [width, setWidth] = useState(1200);
  const lanes = useMemo(() => maxLanesForWidth(width), [width]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!enabled) {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      timersRef.current.clear();
      setActive([]);
      return;
    }

    const latest = messages.slice(-8);
    latest.forEach((message) => {
      if (seen.current.has(message.id)) return;
      seen.current.add(message.id);
      const now = Date.now();
      const assignment = assignFlowingLane({ id: message.id, createdAtMs: now }, laneAvailableAt.current, {
        maxLanes: lanes,
        travelMs: 8500,
        minGapMs: reducedMotion ? 1400 : 1800
      });
      const delay = Math.max(0, assignment.startsAtMs - now);
      const startTimer = window.setTimeout(() => {
        timersRef.current.delete(startTimer);
        const item: ActiveFlowMessage = { message, lane: assignment.lane, key: `${message.id}-${assignment.startsAtMs}` };
        setActive((items) => [...items.slice(-10), item]);
        const removalTimer = window.setTimeout(() => {
          timersRef.current.delete(removalTimer);
          setActive((items) => items.filter((activeItem) => activeItem.key !== item.key));
        }, reducedMotion ? 2200 : 9200);
        timersRef.current.add(removalTimer);
      }, delay);
      timersRef.current.add(startTimer);
    });
  }, [enabled, lanes, messages, reducedMotion]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-x-0 top-[9%] bottom-[22%] z-20 overflow-hidden sm:top-[10%] sm:bottom-[18%]" aria-hidden="true">
      <AnimatePresence>
        {active.map(({ message, lane, key }) => {
          const top = `${(lane + 0.5) * (100 / lanes)}%`;
          const profile = message.profiles;
          const senderName = messageSenderName(profile);
          return (
            <motion.div
              key={key}
              className="absolute left-0 flex max-w-[72%] items-center gap-1.5 rounded-full border border-white/12 bg-[#080c0d]/72 px-2 py-1.5 text-xs text-[var(--color-text)] shadow-[0_8px_28px_rgba(0,0,0,0.34)] backdrop-blur-md sm:max-w-[78%] sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
              style={{ top }}
              initial={reducedMotion ? { opacity: 0, x: 16 } : { x: "-105%", opacity: 0.92 }}
              animate={reducedMotion ? { opacity: [0, 1, 1, 0], x: 16 } : { x: "110vw", opacity: 0.96 }}
              exit={{ opacity: 0 }}
              transition={reducedMotion ? { duration: 2.1 } : { duration: 8.8, ease: "linear" }}
            >
              <Avatar src={profile?.avatar_url} name={senderName} className="h-5 w-5 text-[9px] sm:h-6 sm:w-6 sm:text-[10px]" />
              <span className="font-semibold text-[#a8efd9]">{firstName(senderName)}</span>
              <span className="truncate">{message.body}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
