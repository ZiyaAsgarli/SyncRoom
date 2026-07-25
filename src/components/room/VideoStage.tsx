import { Expand, MonitorPlay, Moon } from "lucide-react";
import type { Message } from "../../types/database";
import { Button } from "../ui/Button";
import { FlowingMessages } from "./FlowingMessages";

export function VideoStage({ messages, flowingEnabled }: { messages: Message[]; flowingEnabled: boolean }) {
  return (
    <section className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-[#050607] shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(118,228,196,0.12),transparent_38%)]" />
      <div className="absolute inset-0 grid place-items-center px-6 text-center">
        <div>
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-white/12 bg-white/6">
            <MonitorPlay className="h-7 w-7 text-[#76e4c4]" />
          </div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Future source</p>
          <h2 className="mt-3 text-xl font-semibold sm:text-2xl">Choose a video in the next step.</h2>
          <p className="mt-2 text-sm text-zinc-500">YouTube and Google Drive playback will plug into this stage later.</p>
        </div>
      </div>
      <FlowingMessages messages={messages} enabled={flowingEnabled} />
      <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-lg border border-white/10 bg-black/56 px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-zinc-600" />
          <div className="h-1.5 w-28 rounded-full bg-zinc-800 sm:w-56"><div className="h-full w-0 rounded-full bg-[#76e4c4]" /></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" disabled className="h-9 w-9 p-0" aria-label="Cinema mode coming later"><Moon className="h-4 w-4" /></Button>
          <Button variant="ghost" disabled className="h-9 w-9 p-0" aria-label="Fullscreen coming later"><Expand className="h-4 w-4" /></Button>
        </div>
      </div>
    </section>
  );
}
