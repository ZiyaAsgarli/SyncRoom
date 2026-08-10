# SyncRoom

SyncRoom is a private two-person watch-party web application. It is intentionally not a public platform: one permanent owner approves the Google accounts that may sign in, and each room still contains only the owner and one approved guest.

Visual tagline: "Just us, perfectly in sync."

## Architecture

- Frontend: React, Vite, TypeScript, Tailwind CSS, Motion for React, React Router, Lucide React.
- Auth, database, realtime, and presence: Supabase Free.
- Deployment target: Vercel Hobby for the static frontend.
- Google OAuth: Google Cloud Console OAuth app in Testing mode.

There is no custom Node.js, Express, Socket.IO, Railway, Render, Cloud Run, Redis, or service-role frontend backend. Supabase PostgreSQL functions, constraints, and RLS policies enforce private access and two-person room capacity.

## Private Two-Person Constraint

The private access list lives in `public.allowed_users`, not in public frontend environment variables. The owner can approve or revoke guests through owner-only RPCs; guests cannot enumerate or modify the list. The frontend never stores a service-role key and cannot write the table directly.

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
VITE_APP_NAME=SyncRoom
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GOOGLE_CLIENT_ID=your-google-web-oauth-client-id
VITE_GOOGLE_PICKER_API_KEY=your-google-picker-api-key
VITE_GOOGLE_APP_ID=your-google-cloud-project-number
```

Do not put the two allowed emails in `.env.local`.

Do not put a Google OAuth Client Secret in any frontend environment file.

## Supabase Setup

1. Create a Supabase project on the Free plan.
2. Run the migrations in filename order. Existing deployments must apply `supabase/migrations/202608070001_private_room_realtime_authorization.sql` after the owner-managed access migration before deploying the matching private-channel frontend.
3. For a fresh deployment, seed the permanent owner and optionally one initial guest using the internal compatibility role `friend`:

```sql
insert into public.allowed_users (email, private_role)
values
  (lower('OWNER_GOOGLE_EMAIL'), 'owner'),
  (lower('FRIEND_GOOGLE_EMAIL'), 'friend');
```

4. The owner can then manage additional guest accounts from the **Guest access** dashboard section. The migration keeps the existing `friend` row active and uses that enum value internally for all guests to preserve room and message history.
5. Enable Realtime for `messages` and `room_members` in Supabase if it is not already enabled for those tables. The latest migration also authorizes private Presence and Broadcast topics for active room members; only the host may send on the authoritative playback topic.

### Owner-managed guest access

- There is exactly one owner. The application provides no owner-promotion flow.
- Guest email addresses are trimmed, lowercased, unique, and soft-disabled when access is removed.
- Revocation preserves profiles, room membership, and message history while immediately blocking protected RLS/RPC access.
- An already-open guest session is signed out after the next access recheck; protected database operations are denied immediately.
- An invite link does not grant access by itself. The Google account must also be an active approved guest.
- Every room remains capped atomically at two active members: the owner and one guest.
- While the Google OAuth application remains in Testing mode, each newly approved guest must also be added manually as a Google OAuth test user in Google Cloud Console before that account can complete Google sign-in.
6. Keep Row Level Security enabled.

## Database Objects

Tables:

- `allowed_users`
- `profiles`
- `rooms`
- `room_members`
- `messages`
- `room_playback_states`

RPC functions:

- `sync_private_profile`
- `create_private_room`
- `join_private_room`
- `leave_private_room`
- `end_private_room`
- `set_room_youtube_source`
- `set_room_drive_source`
- `update_room_playback_state`
- `get_room_playback_snapshot`

Security helpers:

- `normalized_auth_email`
- `is_allowed_user`
- `is_active_room_member`
- `is_room_host`

The join RPC locks the target room row and verifies whitelist membership, room existence, non-ended status, non-duplicate membership, capacity below two, and that the joining account is the permitted second private role.

## Google OAuth Setup

In Google Cloud Console:

1. Create an OAuth consent screen.
2. Keep the app in Testing mode.
3. Add the owner and every currently approved guest Google account as test users.
4. Create an OAuth web client.
5. Add Supabase's Google callback URL from Supabase Auth provider settings.

In Supabase:

1. Enable Google provider under Authentication.
2. Add the Google client ID and secret.
3. Add local and Vercel redirect URLs:
   - `http://localhost:5173`
   - `http://localhost:5173/`
   - `https://YOUR-VERCEL-DOMAIN.vercel.app`
   - `https://YOUR-VERCEL-DOMAIN.vercel.app/`

Do not request Google Drive scopes during normal login. Step 3 uses Google Identity Services incremental authorization only when a user explicitly chooses or connects a Drive video.

## Local Development

```bash
npm install
npm run dev
```

Validation commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

The production release checklist is in `docs/V1_PRODUCTION_QA.md`.

## Vercel Deployment

1. Import this repository into Vercel.
2. Use the Vite defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
3. Add `VITE_APP_NAME`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
4. Add the final Vercel URL to Supabase Auth redirect URLs and Google OAuth authorized origins/redirect configuration.

The production response also sets low-risk `nosniff`, referrer, permissions, and anti-framing headers. A Content Security Policy is intentionally deferred until its Google OAuth, Picker, YouTube, Supabase, and Drive endpoint allowlists can be exercised end to end.

## Security and RLS Overview

- Unknown users cannot read application data.
- Whitelisted users sync profiles through Google OAuth metadata.
- The whitelist table rejects direct frontend reads and writes.
- Rooms and memberships are changed through RPCs.
- Messages are readable and writable only by active room members.
- Message inserts require `user_id = auth.uid()`.
- Ended rooms reject new joins.
- Host-only room ending is enforced by `end_private_room`.
- Room Presence and Broadcast use private Realtime channels. Active membership is required to receive or send; the authoritative playback topic additionally requires host membership.

## Completed in Step 1

- Vite React TypeScript project foundation.
- Supabase Auth Google login flow.
- Private whitelist verification and denied-account sign-out.
- Dashboard for two private users.
- Secure room create/join/leave/end service calls.
- Realtime message history and sending.
- Supabase Presence integration.
- Responsive watch-room layout.
- Flowing horizontal messages over the video placeholder.
- Reduced-motion behavior for flowing messages.
- Tests for invite code normalization, message validation, lane assignment, route behavior, and room status utilities.

## Completed in Step 2

- Fixed realtime chat delivery by validating `postgres_changes` INSERT payloads and merging inserted rows directly into local chat state.
- Added optimistic-message deduplication that replaces matching optimistic rows with confirmed database rows.
- Split historical chat history from the live flowing-message queue so refreshes and old rooms do not replay prior messages over the player.
- Added a compact accessible emoji picker in the message composer.
- Added invite-copy feedback with clipboard fallback and failure state.
- Added route-level lazy loading and room-only YouTube code loading.
- Added YouTube URL parsing for `watch`, `youtu.be`, `embed`, mobile, and Shorts links.
- Added the YouTube IFrame Player API adapter.
- Added host-authoritative playback state storage, Realtime Broadcast events, readiness, heartbeats, snapshot recovery, drift utilities, and echo suppression.

## Completed in Step 3

- Added browser-side Google Drive video selection without adding a custom backend.
- Added incremental Google Identity Services authorization for `https://www.googleapis.com/auth/drive.file`.
- Added Google Picker integration for single-file MP4/WebM selection.
- Added safe Drive metadata validation and `set_room_drive_source`.
- Extended playback source state to support `youtube` and `google_drive`.
- Added a generic playback adapter surface shared by YouTube and Drive.
- Added native HTML5 Drive playback through a same-origin service worker media gateway.
- Added Range forwarding from the browser video element to Google Drive media downloads.
- Kept Drive access tokens client-side and in memory only.
- Added friend-side Drive connect flow for the exact host-selected file.
- Preserved the host-authoritative sync layer for play, pause, seek, rate, heartbeat, drift correction, and snapshots.

See `docs/GOOGLE_DRIVE_SETUP.md` and `docs/STEP_3_DRIVE_QA.md`.

## Realtime Chat Fix

The `messages` table must be included in the `supabase_realtime` publication. Step 2 adds an idempotent migration that safely adds:

- `public.messages`
- `public.room_members`

This normalizes the manual SQL that may already have been run:

```sql
alter publication supabase_realtime add table public.messages;
```

The frontend now subscribes to:

- event: `INSERT`
- schema: `public`
- table: `messages`
- filter: `room_id=eq.<current-room-id>`

The subscription is created only after the room and authenticated profile are ready, logs status in development, handles `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, and `CLOSED`, and removes the channel on cleanup.

Presence and playback Broadcast channels are private. Playback uses separate topics for host-authoritative commands and participant readiness/recovery traffic so a guest cannot publish a forged Play, Pause, Seek, Rate, source, or heartbeat command on the authoritative topic.

## Flowing Messages

Initial chat history is loaded into the chat panel only. A baseline of known message IDs is established before the subscription is marked ready. Only new live messages after that baseline enter the flowing-message queue.

## Emoji Behavior

The message composer includes a small custom emoji grid. Selecting an emoji inserts it at the current cursor position, keeps the textarea focused, closes on outside click or Escape, and does not interfere with native mobile emoji keyboards.

## YouTube Architecture

Step 2 uses the official YouTube IFrame Player API. No YouTube Data API key is required because SyncRoom does not search YouTube or fetch metadata.

- The host selects or replaces the YouTube source.
- The friend sees a waiting state and cannot edit the source.
- Host controls play, pause, seek, and speed.
- Friend playback controls are locked and marked as host-controlled.
- Volume, mute, fullscreen, cinema mode, chat, and flowing-message toggle remain local.

## Google Drive Architecture

Google Drive authorization is separate from normal login. SyncRoom requests Drive access only after an explicit user action:

- Host clicks Choose from Google Drive.
- Friend clicks Connect Google Drive for a host-selected Drive source.

The requested scope is only:

```text
https://www.googleapis.com/auth/drive.file
```

Drive tokens are never stored in Supabase, PostgreSQL, URLs, localStorage, sessionStorage, chat, or logs. They remain local to the browser session and are passed to the service worker through a page-to-service-worker message for the currently selected file only.

The host selects an MP4 or WebM file through Google Picker. SyncRoom stores only safe metadata:

- file ID
- filename
- MIME type
- file size
- modified time

The friend must have the file shared with their Google account. SyncRoom does not modify Google Drive permissions and does not require public sharing.

## Drive Media Streaming

A normal `<video>` element cannot attach an OAuth `Authorization` header. SyncRoom uses a same-origin service worker route instead:

```text
/__syncroom_drive_media__/{fileId}
```

The service worker validates the internal file ID, rejects unbound files, and fetches:

```text
https://www.googleapis.com/drive/v3/files/{fileId}?alt=media
```

It forwards browser `Range` requests and streams the Google Drive response body back to the video element. It preserves safe media headers such as `Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`, and `ETag` where Drive provides them. It does not cache Drive video bytes.

If service workers are unavailable, SyncRoom shows a secure streaming unsupported message and YouTube remains usable.

## Playback Synchronization

Realtime Broadcast is used for low-latency playback events. PostgreSQL `room_playback_states` is used for initial load, refresh, reconnect, and missed-event recovery.

Events are validated with Zod and include room ID, event ID, sender, state version, timestamp, video ID, time, rate, and status. Wrong-room, malformed, duplicate, stale, and unauthorized host-command events are rejected.

The host is authoritative. Only the host can write playback state through:

- `set_room_youtube_source`
- `update_room_playback_state`

Friends can read snapshots through:

- `get_room_playback_snapshot`

Remote commands use a short suppression window so applying a remote play, pause, seek, or rate change does not echo back as a new local command.

## Autoplay, Drift, Buffering, and Reconnect

SyncRoom does not try to bypass browser autoplay rules. Each participant taps to enable synchronized playback. If playback is blocked, the UI shows a local non-intrusive state and waits for a user gesture.

Drift correction calculates:

```text
targetTime = eventCurrentTime + networkElapsedSeconds * playbackRate
```

Small drift is ignored, medium drift uses temporary rate correction where supported, and larger drift seeks directly. Correction is skipped while buffering.

The host broadcasts heartbeats approximately every 4.5 seconds and persists snapshots approximately every 14 seconds while playing, plus immediate persistence on important state changes.

Heartbeats are Supabase Realtime Broadcast only. They must not call `update_room_playback_state`.

Periodic recovery snapshots preserve the current `state_version`. Major authoritative changes increment it:

- source change
- play
- pause
- explicit seek
- playback-rate change

Stale snapshot writes are treated as no-op optimistic-concurrency results and return the latest row instead of raising a transaction error.

## Playback Request-Count QA

Before opening SyncRoom against the live Supabase project, reset query stats if `pg_stat_statements` is enabled:

```sql
select pg_stat_statements_reset();
```

Then:

1. Open one host browser.
2. Enter a room.
3. Load a YouTube video.
4. Play for 60 seconds.
5. Do not interact.
6. Query `pg_stat_statements` for `update_room_playback_state`.

Expected periodic calls: approximately 4-5, not hundreds, thousands, or millions.

Then:

7. Add the friend.
8. Play another 60 seconds.
9. Confirm the guest does not double the snapshot count.
10. Perform Play, Pause, and Seek commands.
11. Confirm only reasonable additional command writes appear.

Also inspect Postgres Logs. Expected: zero repeated `Stale playback state version` errors.

On refresh or reconnect, the app restores auth, room membership, playback snapshot, channel subscription, player initialization, and then requests a fresh sync.

## Manual Two-Browser QA Checklist

Use a normal Chrome window for the owner and an Incognito window for the friend.

1. Owner login
2. Friend login
3. Owner creates room
4. Invite copies and shows feedback
5. Friend joins
6. Friend sends message
7. Owner receives message instantly without refresh
8. Owner sends message
9. Friend receives message instantly without refresh
10. No duplicate chat messages
11. Refreshing does not replay old messages over video
12. New messages flow over video
13. Emoji insertion works
14. Host adds YouTube URL
15. Both players load same video
16. Both enable playback
17. Host plays
18. Host pauses
19. Host seeks
20. Host changes speed
21. Friend synchronized controls remain locked
22. Friend changes local volume
23. Friend refreshes while playing
24. Host refreshes while playing
25. Temporary connection loss
26. Chat during playback
27. Flowing messages during playback
28. Fullscreen
29. Cinema mode
30. Mobile portrait
31. Mobile landscape
32. Room ending
33. Third account remains blocked
34. Friend cannot forge host events

## Remote Play Regression Checklist

Use this checklist after the remote Play fix:

1. Open owner in normal Chrome.
2. Open friend in Incognito.
3. Join the same room.
4. Load an embeddable YouTube video.
5. Click Enable sync on both.
6. Confirm both show ready.
7. Host presses Play.
8. Confirm both videos begin without refreshing.
9. Confirm timestamps remain close.
10. Host presses Pause.
11. Confirm both pause.
12. Host presses Play again.
13. Confirm both resume.
14. Host seeks.
15. Confirm both reach the same position.
16. Refresh friend while host is playing.
17. Re-enable playback if the browser requires a gesture.
18. Confirm the friend resumes at the current host position.

## Current Limitations

- Google Drive playback requires manual Google Cloud setup before live testing.
- Google Drive files must be shared manually from the host to the friend in Google Drive.
- Only MP4 and WebM are treated as supported Drive formats; browser codec support can still vary by device.
- Drive access tokens are temporary, so long sessions may require reconnecting Drive.
- Full Drive QA requires the live Supabase project, Google Picker, a shared Drive file, and two real Google test accounts.
- YouTube playlists, search, queueing, and the YouTube Data API are intentionally excluded.
- Public Drive links, uploads, automatic Drive permission changes, subtitles, transcoding, and playlists are intentionally excluded.

## Troubleshooting

- If login succeeds but returns to access denied, confirm the Google email is lowercase in `allowed_users`.
- If profile sync fails, confirm the Google provider is enabled in Supabase Auth.
- If messages do not appear live, confirm Supabase Realtime is enabled for the relevant tables.
- If OAuth redirects fail, check Supabase, Google, and Vercel URLs for exact protocol and domain matches.
- Never fix authorization by adding frontend email environment variables.

## Recommended Step 4 Scope

Step 4 should be stabilization only after Google Drive synchronization is confirmed through the manual QA checklist:

- Polish any Drive browser/device issues discovered in two-browser QA.
- Improve token-expiry recovery messaging if needed.
- Tighten mobile Drive playback ergonomics after real-device testing.
- Add only targeted fixes for observed Drive playback or sharing edge cases.
- Do not add public rooms, queues, uploads, playlists, or broader Drive scopes.
