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
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
      variant === "primary" && "bg-[var(--color-accent)] text-[#06110f] shadow-[0_8px_24px_rgba(39,124,103,0.16)] hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)]",
      variant === "secondary" && "border border-[var(--color-border)] bg-white/[0.055] text-[var(--color-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] hover:border-white/20 hover:bg-white/[0.09]",
      variant === "ghost" && "text-[var(--color-text-secondary)] hover:bg-white/[0.07] hover:text-[var(--color-text)]",
      variant === "danger" && "border border-[#ef7f82]/30 bg-[#ef7f82]/10 text-[#ffc5c6] hover:border-[#ef7f82]/45 hover:bg-[#ef7f82]/16",
      className
    )}
    {...props}
  />
));
Button.displayName = "Button";
