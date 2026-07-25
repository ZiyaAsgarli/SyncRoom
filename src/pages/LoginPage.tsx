import { Chrome } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { PRODUCT } from "../config/product";
import { signInWithGoogle } from "../services/authService";
import { Button } from "../components/ui/Button";

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Google sign-in could not start.");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#070809] px-4 py-[max(1rem,env(safe-area-inset-top))] text-white sm:px-6 sm:py-12">
      <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl backdrop-blur-xl sm:rounded-2xl sm:p-7">
        <p className="text-sm font-semibold tracking-[0.28em] text-[#76e4c4]">{PRODUCT.logoText}</p>
        <h1 className="mt-4 text-2xl font-semibold sm:mt-5 sm:text-3xl">Private watch nights, kept simple.</h1>
        <p className="mt-3 text-zinc-400">{PRODUCT.description}</p>
        <Button onClick={handleLogin} disabled={loading} className="mt-8 w-full">
          <Chrome className="h-5 w-5" />
          {loading ? "Opening Google..." : "Continue with Google"}
        </Button>
        <p className="mt-4 text-center text-xs text-zinc-500">{PRODUCT.privateNotice}</p>
        {error ? <p className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
      </motion.section>
    </main>
  );
}
