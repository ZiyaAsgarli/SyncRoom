import { PRODUCT } from "../../config/product";

export function LoadingScreen({ label = "Loading private room..." }: { label?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#070809] px-6 text-white">
      <div className="text-center">
        <div className="mx-auto mb-5 h-11 w-11 rounded-full border border-white/15 border-t-[#76e4c4] animate-spin" />
        <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">{PRODUCT.logoText}</p>
        <p className="mt-2 text-zinc-300">{label}</p>
      </div>
    </main>
  );
}
