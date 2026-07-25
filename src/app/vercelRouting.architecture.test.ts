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
});
