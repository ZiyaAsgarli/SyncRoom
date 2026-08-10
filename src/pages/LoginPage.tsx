import { Chrome, LockKeyhole, PlayCircle, UsersRound } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { PRODUCT } from "../config/product";
import { signInWithGoogle } from "../services/authService";
import { Button } from "../components/ui/Button";
import { Brand } from "../components/ui/Brand";
import { userFacingError } from "../utils/userFacingError";

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (loginError) {
      setError(userFacingError(loginError, "Google sign-in could not start."));
      setLoading(false);
    }
  }

  return (
    <main className="app-page grid min-h-dvh place-items-center px-4 py-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-12">
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="surface-elevated w-full max-w-md p-5 sm:p-8">
        <Brand />
        <p className="mt-5 text-sm font-medium text-[var(--color-accent)]">{PRODUCT.tagline}</p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight text-[var(--color-text)] sm:text-3xl">Private watch nights, shared beautifully.</h1>
        <p className="mt-3 leading-relaxed text-[var(--color-text-secondary)]">{PRODUCT.description}</p>
        <div className="mt-6 grid grid-cols-2 gap-2 text-xs text-[var(--color-text-muted)]">
          <span className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-[var(--color-accent)]" />Two-person rooms</span>
          <span className="flex items-center gap-2"><PlayCircle className="h-4 w-4 text-[var(--color-accent-secondary)]" />YouTube &amp; Drive</span>
        </div>
        <Button onClick={handleLogin} disabled={loading} className="mt-7 w-full">
          <Chrome className="h-5 w-5" />
          {loading ? "Opening Google..." : "Continue with Google"}
        </Button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-[var(--color-text-muted)]"><LockKeyhole className="h-3.5 w-3.5" />{PRODUCT.privateNotice}</p>
        {error ? <p className="mt-4 rounded-lg border border-[#ef7f82]/25 bg-[#ef7f82]/10 p-3 text-sm text-[#ffc5c6]">{error}</p> : null}
      </motion.section>
    </main>
  );
}
