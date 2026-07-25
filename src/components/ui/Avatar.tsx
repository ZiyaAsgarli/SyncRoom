import { initials } from "../../utils/names";
import { cn } from "../../utils/cn";

export function Avatar({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  return (
    <span className={cn("grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-800 text-sm font-bold text-zinc-200 ring-1 ring-white/10", className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  );
}
