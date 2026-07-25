import { X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "./Button";

interface DialogProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Dialog({ title, open, onClose, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 px-3 py-[max(0.75rem,env(safe-area-inset-top))]" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md overflow-y-auto rounded-xl border border-white/12 bg-[#101113] p-4 text-white shadow-2xl sm:p-5"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between gap-4">
          <h2 id="dialog-title" className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" className="h-10 w-10 p-0" onClick={onClose} aria-label="Close dialog">
            <X className="h-5 w-5" />
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}
