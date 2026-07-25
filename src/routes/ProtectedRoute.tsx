import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ROUTES } from "../config/routes";
import { useAuth } from "../hooks/useAuth";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { Button } from "../components/ui/Button";

export function ProtectedRoute() {
  const { status, transientProfileError, refreshProfile, profileLoading } = useAuth();
  const location = useLocation();

  if (status === "loading") return <LoadingScreen />;
  if (status === "anonymous") return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
  if (status === "denied") return <Navigate to={ROUTES.accessDenied} replace />;
  if (status === "profile_error") {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#070809] px-6 text-white">
        <section className="max-w-md rounded-xl border border-white/10 bg-white/[0.055] p-6 text-center">
          <h1 className="text-2xl font-semibold">Private profile unavailable</h1>
          <p className="mt-3 text-sm text-zinc-400">{transientProfileError ?? "Could not load your private profile. Retry."}</p>
          <Button className="mt-6" onClick={() => void refreshProfile()} disabled={profileLoading}>
            {profileLoading ? "Retrying..." : "Retry"}
          </Button>
        </section>
      </main>
    );
  }
  return <Outlet />;
}
