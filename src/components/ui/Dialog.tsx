import { X } from "lucide-react";
import { Button } from "./Button";

interface DialogProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Dialog({ title, open, onClose, children }: DialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-md rounded-xl border border-white/12 bg-[#101113] p-5 text-white shadow-2xl"
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
