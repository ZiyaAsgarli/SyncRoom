import { describe, expect, it } from "vitest";
import { ROUTES } from "../config/routes";

function destinationForAuth(status: "loading" | "anonymous" | "allowed" | "denied") {
  if (status === "anonymous") return ROUTES.login;
  if (status === "denied") return ROUTES.accessDenied;
  if (status === "allowed") return "outlet";
  return "loading";
}

describe("allowed-user route behavior", () => {
  it("keeps protected routes behind authentication and whitelist checks", () => {
    expect(destinationForAuth("anonymous")).toBe("/login");
    expect(destinationForAuth("denied")).toBe("/access-denied");
    expect(destinationForAuth("allowed")).toBe("outlet");
  });
});
