import { Plus, RotateCcw, UserMinus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { addAllowedGuest, listAllowedGuests, setAllowedGuestActive } from "../../services/guestAccessService";
import type { AllowedGuest } from "../../types/database";
import { validateGuestEmail } from "../../utils/guestAccess";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

export function GuestAccessPanel({ ownerEmail }: { ownerEmail: string }) {
  const [guests, setGuests] = useState<AllowedGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [changingEmail, setChangingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadGuests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGuests(await listAllowedGuests());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Guest access could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGuests();
  }, [loadGuests]);

  function upsertGuest(nextGuest: AllowedGuest) {
    setGuests((current) => {
      const withoutGuest = current.filter((guest) => guest.email !== nextGuest.email);
      return [...withoutGuest, nextGuest].sort((left, right) => left.email.localeCompare(right.email));
    });
  }

  async function handleAddGuest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateGuestEmail(email, ownerEmail);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const guest = await addAllowedGuest(validation.email);
      upsertGuest(guest);
      setEmail("");
      setDialogOpen(false);
      setNotice("Guest access added.");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Guest access could not be added.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccessChange(guest: AllowedGuest) {
    setChangingEmail(guest.email);
    setError(null);
    try {
      const updated = await setAllowedGuestActive(guest.email, !guest.is_active);
      upsertGuest(updated);
      setNotice(updated.is_active ? "Guest access restored." : "Guest access removed.");
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Guest access could not be updated.");
    } finally {
      setChangingEmail(null);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-[#101113]/86 p-4 sm:p-5" aria-labelledby="guest-access-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#76e4c4]" aria-hidden="true" />
            <h2 id="guest-access-title" className="font-semibold">Guest access</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-400">Approved Google accounts can join your private invitations.</p>
        </div>
        <Button variant="secondary" className="w-full sm:w-auto" onClick={() => { setError(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" aria-hidden="true" />Add guest
        </Button>
      </div>

      {notice ? <p role="status" className="mt-4 rounded-lg border border-[#76e4c4]/20 bg-[#76e4c4]/8 px-3 py-2 text-sm text-[#baf5e3]">{notice}</p> : null}
      {error && !dialogOpen ? <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <div className="mt-4 divide-y divide-white/8 overflow-hidden rounded-lg border border-white/10">
        {loading ? <p className="p-4 text-sm text-zinc-400">Loading approved guests...</p> : null}
        {!loading && guests.length === 0 ? <p className="p-4 text-sm text-zinc-400">No guests are approved yet.</p> : null}
        {guests.map((guest) => (
          <div key={guest.email} className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="break-all text-sm font-medium sm:truncate" title={guest.email}>{guest.email}</p>
              <p className={guest.is_active ? "mt-1 text-xs text-[#76e4c4]" : "mt-1 text-xs text-zinc-500"}>
                {guest.is_active ? "Approved" : "Access removed"}
              </p>
            </div>
            <Button
              variant={guest.is_active ? "danger" : "secondary"}
              className="w-full shrink-0 sm:w-auto"
              disabled={changingEmail === guest.email}
              onClick={() => void handleAccessChange(guest)}
              aria-label={`${guest.is_active ? "Remove" : "Restore"} access for ${guest.email}`}
            >
              {guest.is_active ? <UserMinus className="h-4 w-4" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
              {guest.is_active ? "Remove" : "Restore"}
            </Button>
          </div>
        ))}
      </div>

      <Dialog title="Add guest" open={dialogOpen} onClose={() => { if (!submitting) setDialogOpen(false); }}>
        <form onSubmit={handleAddGuest} noValidate>
          <p className="text-sm text-zinc-400">Approve one Google account for private room invitations.</p>
          <label className="mt-5 block text-sm font-medium" htmlFor="guest-email">Google email</label>
          <input
            id="guest-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => { setEmail(event.target.value); setError(null); }}
            maxLength={254}
            placeholder="guest@example.com"
            className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/24 px-3 text-white outline-none focus:border-[#76e4c4]/70"
          />
          {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Adding..." : "Add guest"}</Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
