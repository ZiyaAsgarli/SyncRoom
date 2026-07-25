import { LogOut } from "lucide-react";
import { PRODUCT } from "../../config/product";
import { useAuth } from "../../hooks/useAuth";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOutAndReturn } = useAuth();
  return (
    <div className="min-h-dvh bg-[#070809] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(118,228,196,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(214,184,113,0.08),transparent_30%)]" />
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#070809]/82 px-4 backdrop-blur-xl sm:px-6">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4">
          <a href="/" className="text-base font-semibold tracking-wide text-white">{PRODUCT.logoText}</a>
          {profile ? (
            <div className="flex items-center gap-3">
              <Avatar src={profile.avatar_url} name={profile.full_name} className="h-9 w-9" />
              <Button variant="ghost" onClick={signOutAndReturn} aria-label="Sign out" className="px-3">
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
