import { LogOut } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { Avatar } from "../ui/Avatar";
import { Brand } from "../ui/Brand";
import { Button } from "../ui/Button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOutAndReturn } = useAuth();
  return (
    <div className="app-page min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-[var(--color-border-subtle)] bg-[#06080a]/86 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:px-6">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 sm:h-16 sm:gap-4">
          <a href="/" className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-focus)]" aria-label="SyncRoom home"><Brand compact /></a>
          {profile ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <Avatar src={profile.avatar_url} name={profile.full_name} className="h-8 w-8 sm:h-9 sm:w-9" />
              <Button variant="ghost" onClick={signOutAndReturn} aria-label="Sign out" title="Sign out" className="h-11 w-11 p-0 sm:w-auto sm:px-3">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          ) : null}
        </nav>
      </header>
      {children}
    </div>
  );
}
