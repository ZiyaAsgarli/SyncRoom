import { Navigate, Outlet } from "react-router-dom";
import { ROUTES } from "../config/routes";
import { useAuth } from "../hooks/useAuth";
import { LoadingScreen } from "../components/ui/LoadingScreen";

export function PublicOnlyRoute() {
  const { status } = useAuth();
  if (status === "loading") return <LoadingScreen />;
  if (status === "allowed") return <Navigate to={ROUTES.dashboard} replace />;
  return <Outlet />;
}
