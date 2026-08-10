import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AppErrorBoundary", () => {
  it("wraps the application with a safe reload fallback", () => {
    const boundary = readFileSync(resolve(process.cwd(), "src/components/ui/AppErrorBoundary.tsx"), "utf8");
    const entry = readFileSync(resolve(process.cwd(), "src/app/main.tsx"), "utf8");
    expect(entry).toContain("<AppErrorBoundary>");
    expect(boundary).toContain("static getDerivedStateFromError");
    expect(boundary).toContain("Reload SyncRoom");
    expect(boundary).not.toContain("error.message");
  });
});
