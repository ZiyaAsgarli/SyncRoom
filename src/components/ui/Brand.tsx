import { cn } from "../../utils/cn";
import { PRODUCT } from "../../config/product";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative block h-7 w-8 shrink-0" aria-hidden="true">
        <span className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-[#76e4c4]/70 bg-[#76e4c4]/10" />
        <span className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-[#8987c9]/65 bg-[#8987c9]/10" />
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e8f8f3] shadow-[0_0_10px_rgba(118,228,196,0.45)]" />
      </span>
      <span className={cn("font-semibold text-[var(--color-text)]", compact ? "text-base" : "text-lg")}>{PRODUCT.logoText}</span>
    </span>
  );
}
