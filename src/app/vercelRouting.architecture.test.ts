import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES } from "../config/routes";

const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as Record<string, unknown>;
const appSource = readFileSync(resolve(process.cwd(), "src/app/App.tsx"), "utf8");

describe("Vercel SPA routing", () => {
  it("rewrites direct browser requests to the React entry point", () => {
    expect(vercelConfig.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
    expect(vercelConfig).not.toHaveProperty("redirects");
  });

  it("preserves BrowserRouter and the private room route shapes", () => {
    expect(appSource).toContain("BrowserRouter");
    expect(appSource).not.toContain("HashRouter");
    expect(ROUTES.dashboard).toBe("/");
    expect(ROUTES.join()).toBe("/join/:inviteCode");
    expect(ROUTES.room()).toBe("/room/:roomId");
  });

  it("sets low-risk browser hardening headers without introducing a brittle CSP", () => {
    const serialized = JSON.stringify(vercelConfig.headers);
    expect(serialized).toContain("X-Content-Type-Options");
    expect(serialized).toContain("Referrer-Policy");
    expect(serialized).toContain("Permissions-Policy");
    expect(serialized).toContain("X-Frame-Options");
    expect(serialized).not.toContain("Content-Security-Policy");
  });
});
