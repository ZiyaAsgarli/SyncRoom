import { forwardRef } from "react";
import { cn } from "../../utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "primary", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#76e4c4] disabled:cursor-not-allowed disabled:opacity-50",
      variant === "primary" && "bg-[#76e4c4] text-[#061110] hover:bg-[#a7f4dc]",
      variant === "secondary" && "border border-white/12 bg-white/8 text-white hover:bg-white/12",
      variant === "ghost" && "text-zinc-200 hover:bg-white/10",
      variant === "danger" && "border border-red-400/30 bg-red-500/12 text-red-100 hover:bg-red-500/18",
      className
    )}
    {...props}
  />
));
Button.displayName = "Button";
