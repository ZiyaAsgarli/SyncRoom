import { Component, type ReactNode } from "react";
import { Brand } from "./Brand";
import { Button } from "./Button";

interface AppErrorBoundaryState {
  failed: boolean;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    if (import.meta.env.DEV) console.warn("[SyncRoom] unexpected render failure");
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-page grid min-h-dvh place-items-center px-4">
        <section className="surface-elevated w-full max-w-md p-6 text-center" role="alert">
          <Brand />
          <h1 className="mt-6 text-xl font-semibold">SyncRoom needs a fresh start</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Something unexpected interrupted this screen. Your room and messages remain stored safely.</p>
          <Button className="mt-6 w-full" onClick={() => window.location.reload()}>Reload SyncRoom</Button>
        </section>
      </main>
    );
  }
}
