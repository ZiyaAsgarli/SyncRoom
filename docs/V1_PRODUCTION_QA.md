# SyncRoom v1 Production QA

Run this checklist against the production URL with the owner in a normal browser window and an approved guest in an Incognito window or a second device. Record the date, browser versions, commit, tester, and result. Do not use real credentials in screenshots or issue reports.

## Release Preconditions

- [ ] All Supabase migrations in `supabase/migrations` are applied in timestamp order, including `202608070001_private_room_realtime_authorization.sql`.
- [ ] `messages` and `room_members` are present in the `supabase_realtime` publication.
- [ ] Realtime Authorization is enabled and both room channels subscribe successfully.
- [ ] Vercel production environment variables are configured; no private/service-role credential is present.
- [ ] Google OAuth production origin and redirect URL match the production domain.
- [ ] Google Picker key is restricted to Google Picker API and the approved web origins are reviewed.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and `npm audit --omit=dev` have been reviewed.

## Auth And Access

- [ ] Owner Google login restores correctly after refresh.
- [ ] Active approved guest can log in.
- [ ] Unknown Google account is denied and signed out.
- [ ] Revoked guest is denied on login and loses protected access on the next access recheck.
- [ ] A temporary Supabase/network failure shows Retry without signing out a valid account.
- [ ] Sign out completes once and returns to login.

## Guest Management

- [ ] Owner can add a normalized Google email.
- [ ] Duplicate and malformed emails are rejected safely.
- [ ] Owner can revoke and restore a guest.
- [ ] Guest cannot see guest management or call its RPCs.
- [ ] Revocation preserves historical room/message data.

## Rooms And Invites

- [ ] Owner creates a room; guest cannot create one.
- [ ] Invite copy shows success and produces `/join/<CODE>` on the current production origin.
- [ ] Direct invite deep link renders through the SPA fallback.
- [ ] Approved guest joins; unapproved user with the same link remains denied.
- [ ] A third approved guest cannot enter a full room.
- [ ] Guest can leave; owner can end; ended room cannot be rejoined.
- [ ] Users cannot view rooms or participants outside their memberships.

## Realtime And Presence

- [ ] Owner and guest show online after joining.
- [ ] Background/foreground and temporary disconnect update presence without granting authority.
- [ ] Refresh does not create duplicate Presence entries or subscriptions.
- [ ] Private Realtime channels reject a non-member.
- [ ] Guest cannot publish on the host-authoritative playback topic.

## Chat

- [ ] Guest message appears instantly once for owner; owner name/avatar are correct on guest.
- [ ] Owner message appears instantly once for guest; guest name/avatar are correct on owner.
- [ ] Refresh preserves history without replaying it over video.
- [ ] New local and remote messages flow once when enabled.
- [ ] Emoji insertion, multiline text, 500-character limit, and send failure recovery work.
- [ ] Mobile inline chat keeps history scrollable and composer reachable with keyboard open.

## YouTube

- [ ] Host loads a supported URL; both players load the same video.
- [ ] One local unlock gesture is requested only when the browser requires it.
- [ ] Explicit Play/Pause, seek, -10, +10, and rate synchronize; guest controls remain read-only.
- [ ] Four or more heartbeats do not roll the guest backward.
- [ ] Captions/settings remain local and do not send playback writes/events.
- [ ] Refresh guest and host independently; recover near current host position.
- [ ] Fullscreen enter/exit preserves player identity and playback.

## Google Drive

- [ ] Host opens Picker and selects an MP4/WebM; guest authorizes the exact shared file.
- [ ] OAuth requests only `drive.file`; access token is absent from URL, storage, logs, and Supabase.
- [ ] Media loads through `/__syncroom_drive_media__/` after a matching bind ACK.
- [ ] Browser requests receive valid streaming `206`/`Content-Range`; invalid range receives `416`.
- [ ] Play, Pause, seek, -10, and +10 synchronize; guest timeline is visible and read-only.
- [ ] Refresh silently restores the active source without Picker or reconnect when Google permits.
- [ ] Token renewal does not reset `src`, call `load()`, pause, or reconnect a valid session.
- [ ] Controller replacement performs an atomic rebind; stale cleanup cannot clear the active generation.
- [ ] Run for at least 60 minutes, including fullscreen/orientation changes, without a random decode/reconnect error.

## Database Write Rate

- [ ] Reset `pg_stat_statements` before the run if operationally safe.
- [ ] During 60 seconds of uninterrupted host playback, periodic `update_room_playback_state` calls are approximately 4-5.
- [ ] Adding a guest does not double periodic snapshot writes.
- [ ] Heartbeats are Broadcast-only and produce no PostgreSQL writes.
- [ ] Postgres logs contain no repeated stale-version/`40001` errors.

## Responsive Matrix

For each viewport, check zero horizontal overflow, reachable controls, no overlap, long names/files, dialogs, player containment, chat scrolling, and composer visibility.

- [ ] Phone portrait: 320x568, 360x800, 390x844, 412x915.
- [ ] Phone landscape: 568x320, 800x360, 844x390, 915x412.
- [ ] Tablet: 768x1024, 820x1180, 1024x768, 1180x820.
- [ ] Desktop: 1280x800, 1366x768, 1440x900, 1536x864, 1920x1080.

## Accessibility And Failure Recovery

- [ ] Keyboard focus is visible; icon buttons expose names; dialogs close with Escape.
- [ ] Guest progress announces read-only current time and duration.
- [ ] Reduced-motion mode suppresses nonessential motion.
- [ ] Realtime loss shows reconnecting and recovers without reload.
- [ ] YouTube, Drive auth/access/network, service-worker, and Picker failures show a calm action rather than a blank screen.
- [ ] An unexpected render failure shows the SyncRoom reload fallback without raw exception details.

## Release Record

- Date:
- Production commit:
- Supabase migration head:
- Owner browser/device:
- Guest browser/device:
- Result: PASS / FAIL
- Open release blockers:
