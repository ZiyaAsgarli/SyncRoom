import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuestAccessPanel } from "./GuestAccessPanel";
import { addAllowedGuest, listAllowedGuests, setAllowedGuestActive } from "../../services/guestAccessService";

vi.mock("../../services/guestAccessService", () => ({
  listAllowedGuests: vi.fn(),
  addAllowedGuest: vi.fn(),
  setAllowedGuestActive: vi.fn()
}));

const guest = { email: "guest@example.com", is_active: true, created_at: "2026-07-28T00:00:00Z" };

describe("GuestAccessPanel", () => {
  beforeEach(() => {
    vi.mocked(listAllowedGuests).mockResolvedValue([guest]);
    vi.mocked(addAllowedGuest).mockReset();
    vi.mocked(setAllowedGuestActive).mockReset();
  });

  it("lists approved guests and revokes access through the owner RPC service", async () => {
    vi.mocked(setAllowedGuestActive).mockResolvedValue({ ...guest, is_active: false });
    render(<GuestAccessPanel ownerEmail="owner@example.com" />);

    expect(await screen.findByText("guest@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove access for guest@example.com" }));

    await waitFor(() => expect(setAllowedGuestActive).toHaveBeenCalledWith("guest@example.com", false));
    expect(await screen.findByText("Access removed")).toBeInTheDocument();
  });

  it("validates owner self-add and adds a normalized guest immediately", async () => {
    vi.mocked(addAllowedGuest).mockResolvedValue({ ...guest, email: "new.guest@example.com" });
    render(<GuestAccessPanel ownerEmail="owner@example.com" />);
    await screen.findByText("guest@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Add guest" }));
    const dialog = screen.getByRole("dialog", { name: "Add guest" });
    const input = screen.getByLabelText("Google email");
    fireEvent.change(input, { target: { value: " OWNER@EXAMPLE.COM " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add guest" }));
    expect(await screen.findByText("Your owner account cannot be added as a guest.")).toBeInTheDocument();
    expect(addAllowedGuest).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: " New.Guest@Example.COM " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add guest" }));
    await waitFor(() => expect(addAllowedGuest).toHaveBeenCalledWith("new.guest@example.com"));
    expect(await screen.findByText("Guest access added.")).toBeInTheDocument();
  });
});
