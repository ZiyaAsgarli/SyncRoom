import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { AuthProvider } from "../contexts/AuthContext";
import { ProtectedRoute } from "../routes/ProtectedRoute";
import { PublicOnlyRoute } from "../routes/PublicOnlyRoute";
import { ROUTES } from "../config/routes";

const AccessDeniedPage = lazy(() => import("../pages/AccessDeniedPage").then((module) => ({ default: module.AccessDeniedPage })));
const DashboardPage = lazy(() => import("../pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const JoinRoomPage = lazy(() => import("../pages/JoinRoomPage").then((module) => ({ default: module.JoinRoomPage })));
const LoginPage = lazy(() => import("../pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));
const RoomPage = lazy(() => import("../pages/RoomPage").then((module) => ({ default: module.RoomPage })));

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingScreen label="Loading SyncRoom..." />}>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path={ROUTES.login} element={<LoginPage />} />
            </Route>
            <Route path={ROUTES.accessDenied} element={<AccessDeniedPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path={ROUTES.dashboard} element={<DashboardPage />} />
              <Route path={ROUTES.join()} element={<JoinRoomPage />} />
              <Route path={ROUTES.room()} element={<RoomPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
