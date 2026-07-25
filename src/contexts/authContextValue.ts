import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Profile } from "../types/database";

export type AuthStatus = "loading" | "anonymous" | "allowed" | "denied" | "profile_error";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  status: AuthStatus;
  authError: string | null;
  authLoading: boolean;
  profileLoading: boolean;
  authenticated: boolean;
  profileReady: boolean;
  transientProfileError: string | null;
  accessDenied: boolean;
  initialSessionResolved: boolean;
  signingOut: boolean;
  refreshProfile: () => Promise<void>;
  signOutAndReturn: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
