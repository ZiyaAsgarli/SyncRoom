# Google Drive Playback QA

Manual QA requires the live Supabase project, an owner and approved guest, and the Google Cloud Drive/Picker configuration from [`GOOGLE_DRIVE_SETUP.md`](GOOGLE_DRIVE_SETUP.md).

## Setup

1. The owner and guest are active SyncRoom accounts and Google OAuth test users.
2. The owner has an MP4 or WebM in Google Drive.
3. The owner shares that file with the guest as Viewer.
4. Both accounts enter the same SyncRoom room.

## Source Selection And Access

5. The host chooses Google Drive and authorizes `drive.file` when required.
6. The host selects the video in Google Picker.
7. The Picker closes and the selected filename appears in the room.
8. The host video loads through the service-worker media gateway.
9. The guest authorizes Drive access to the exact shared file when required.
10. The guest video loads without changing the room source.

## Synchronization

11. If the browser requires a playback gesture, the guest taps the video once to sync.
12. The host presses the explicit Play control; both videos start.
13. Let playback run for at least 30 seconds and confirm there is no heartbeat rollback.
14. The host pauses and resumes; the guest follows both commands.
15. The host seeks forward and backward; the guest follows.
16. The host uses rewind 10 and forward 10; exactly one authoritative seek is applied each time.
17. The guest timeline displays time and progress but cannot seek.
18. Guest volume and fullscreen remain local.

## Range Streaming

19. Seek near the middle of a large video and confirm a byte `Range` request.
20. Confirm the response is a valid `206` with `Content-Range`, `Content-Length`, `Accept-Ranges`, and the video MIME type.
21. Seek near the end and confirm playback resumes without downloading the entire file into memory.
22. Confirm an out-of-bounds range produces `416`.

Development-only diagnostics may show safe media range/status data, but never tokens, emails, or complete private identifiers.

## Chat And Overlays

23. Send owner and guest messages while Drive playback runs.
24. Each message appears once with the correct sender identity.
25. New live messages flow over video when enabled; historical messages do not replay.
26. Fullscreen keeps flowing messages and local controls above the video.
27. Chat, overlay visibility, and fullscreen do not recreate the video element.

## Refresh, Token Renewal, And Recovery

28. Refresh the guest while the host is playing.
29. Confirm the active source restores without Picker or a Connect action when silent Google authorization succeeds.
30. Confirm playback recovers near the current host position after any required local gesture.
31. Allow a silent token renewal and confirm it does not reset `src`, call `load()`, pause playback, or reconnect a valid media session.
32. Replace the service-worker controller and confirm the active generation rebinds atomically.
33. If silent authorization genuinely requires interaction, confirm one stable **Connect Google Drive** action appears without popup loops.

## Source Switching And Errors

34. Switch Drive to YouTube and back to Drive; both players switch cleanly.
35. Confirm a valid in-memory Drive authorization is reused.
36. Test an unshared file and confirm clear permission guidance.
37. Test an unsupported format and confirm a format-specific error.
38. Confirm a missing worker session performs one bounded rebind rather than showing a false codec error.

## Mobile And Fullscreen

39. Test phone portrait with inline chat visible below the player.
40. Test phone landscape and real fullscreen.
41. Confirm best-effort landscape orientation lock does not reset playback when unsupported.
42. Test tablet portrait and landscape without horizontal overflow.

## Expected Security Results

- Drive access tokens do not appear in URLs, storage, Supabase, or logs.
- The service worker fetches only the bound Drive file through the fixed Drive API endpoint.
- YouTube remains usable when Drive configuration is unavailable.
- Only the host can change the source or publish authoritative playback commands.
- The guest cannot write playback snapshots.

## Playback Snapshot Request Count

If `pg_stat_statements` is enabled and resetting it is operationally safe:

```sql
select pg_stat_statements_reset();
```

1. Play a source as host for 60 seconds without interacting.
2. Query `pg_stat_statements` for `update_room_playback_state`.
3. Expect approximately four or five periodic calls, not high-frequency writes.
4. Add the guest and play another 60 seconds; the guest must not double the snapshot count.
5. Perform Play, Pause, and Seek commands and confirm only reasonable command writes are added.
6. Inspect PostgreSQL logs and confirm there are no repeated stale-version or `40001` errors.
