import { Link } from "react-router-dom";
import { ROUTES } from "../config/routes";
import { Button } from "../components/ui/Button";

export function NotFoundPage() {
  return (
    <main className="app-page grid min-h-dvh place-items-center px-6 text-center">
      <section className="surface-section max-w-md p-7">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-3xl font-semibold">Room not found</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">That private route does not exist.</p>
        <Link to={ROUTES.dashboard}><Button className="mt-6">Go home</Button></Link>
      </section>
    </main>
  );
}
