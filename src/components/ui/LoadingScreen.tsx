import { PRODUCT } from "../../config/product";

export function LoadingScreen({ label = "Loading private room..." }: { label?: string }) {
  return (
    <main className="app-page grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border border-white/12 border-t-[var(--color-accent)]" />
        <p className="eyebrow">{PRODUCT.logoText}</p>
        <p className="mt-2 text-[var(--color-text-secondary)]">{label}</p>
      </div>
    </main>
  );
}
