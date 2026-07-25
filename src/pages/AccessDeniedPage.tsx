import { Link } from "react-router-dom";
import { PRODUCT } from "../config/product";
import { ROUTES } from "../config/routes";
import { Button } from "../components/ui/Button";

export function AccessDeniedPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#070809] px-6 text-white">
      <section className="max-w-md text-center">
        <p className="text-sm font-semibold tracking-[0.28em] text-[#76e4c4]">{PRODUCT.logoText}</p>
        <h1 className="mt-4 text-3xl font-semibold">Private access only</h1>
        <p className="mt-3 text-zinc-400">This Google account is not on the two-person whitelist, so it was signed out before any profile or room data was opened.</p>
        <Link to={ROUTES.login}><Button className="mt-7">Back to sign in</Button></Link>
      </section>
    </main>
  );
}
