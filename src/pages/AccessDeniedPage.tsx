import { Link, useLocation } from "react-router-dom";
import { ROUTES } from "../config/routes";
import { Button } from "../components/ui/Button";
import { Brand } from "../components/ui/Brand";

export function AccessDeniedPage() {
  const location = useLocation();
  const revoked = Boolean((location.state as { revoked?: boolean } | null)?.revoked);
  return (
    <main className="app-page grid min-h-dvh place-items-center px-6">
      <section className="surface-elevated max-w-md p-7 text-center">
        <Brand className="justify-center" />
        <h1 className="mt-4 text-3xl font-semibold">Private access only</h1>
        <p className="mt-3 leading-relaxed text-[var(--color-text-secondary)]">
          {revoked
            ? "Your access to this private SyncRoom has been removed."
            : "This Google account has not been approved by the owner, so it was signed out before private room data was opened."}
        </p>
        <Link to={ROUTES.login}><Button className="mt-7">Back to sign in</Button></Link>
      </section>
    </main>
  );
}
