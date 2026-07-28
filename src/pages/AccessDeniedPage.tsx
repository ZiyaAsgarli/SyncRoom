import { Link, useLocation } from "react-router-dom";
import { PRODUCT } from "../config/product";
import { ROUTES } from "../config/routes";
import { Button } from "../components/ui/Button";

export function AccessDeniedPage() {
  const location = useLocation();
  const revoked = Boolean((location.state as { revoked?: boolean } | null)?.revoked);
  return (
    <main className="grid min-h-dvh place-items-center bg-[#070809] px-6 text-white">
      <section className="max-w-md text-center">
        <p className="text-sm font-semibold tracking-[0.28em] text-[#76e4c4]">{PRODUCT.logoText}</p>
        <h1 className="mt-4 text-3xl font-semibold">Private access only</h1>
        <p className="mt-3 text-zinc-400">
          {revoked
            ? "Your access to this private SyncRoom has been removed."
            : "This Google account has not been approved by the owner, so it was signed out before private room data was opened."}
        </p>
        <Link to={ROUTES.login}><Button className="mt-7">Back to sign in</Button></Link>
      </section>
    </main>
  );
}
