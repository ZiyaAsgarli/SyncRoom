import { Link } from "react-router-dom";
import { ROUTES } from "../config/routes";
import { Button } from "../components/ui/Button";

export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#070809] px-6 text-center text-white">
      <section>
        <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">404</p>
        <h1 className="mt-3 text-3xl font-semibold">Room not found</h1>
        <p className="mt-2 text-zinc-400">That private route does not exist.</p>
        <Link to={ROUTES.dashboard}><Button className="mt-6">Go home</Button></Link>
      </section>
    </main>
  );
}
