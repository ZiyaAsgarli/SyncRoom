import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "../../types/database";
import { firstName } from "../../utils/names";
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
  const [width, setWidth] = useState(1200);
  const lanes = useMemo(() => maxLanesForWidth(width), [width]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled) {
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
      window.setTimeout(() => {
        const item: ActiveFlowMessage = { message, lane: assignment.lane, key: `${message.id}-${assignment.startsAtMs}` };
        setActive((items) => [...items.slice(-10), item]);
        window.setTimeout(() => {
          setActive((items) => items.filter((activeItem) => activeItem.key !== item.key));
        }, reducedMotion ? 2200 : 9200);
      }, delay);
    });
  }, [enabled, lanes, messages, reducedMotion]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-x-0 top-[10%] bottom-[18%] z-20 overflow-hidden" aria-hidden="true">
      <AnimatePresence>
        {active.map(({ message, lane, key }) => {
          const top = `${(lane + 0.5) * (100 / lanes)}%`;
          const profile = message.profiles;
          return (
            <motion.div
              key={key}
              className="absolute left-0 flex max-w-[78%] items-center gap-2 rounded-full border border-white/10 bg-black/48 px-3 py-2 text-sm text-white shadow-xl backdrop-blur-md"
              style={{ top }}
              initial={reducedMotion ? { opacity: 0, x: 16 } : { x: "-105%", opacity: 0.92 }}
              animate={reducedMotion ? { opacity: [0, 1, 1, 0], x: 16 } : { x: "110vw", opacity: 0.96 }}
              exit={{ opacity: 0 }}
              transition={reducedMotion ? { duration: 2.1 } : { duration: 8.8, ease: "linear" }}
            >
              <Avatar src={profile?.avatar_url} name={profile?.full_name ?? "Friend"} className="h-6 w-6 text-[10px]" />
              <span className="font-semibold text-[#b7f7de]">{firstName(profile?.full_name ?? "Friend")}</span>
              <span className="truncate">{message.body}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
