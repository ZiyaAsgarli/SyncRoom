# Step 3 Drive QA

Manual QA requires the live Supabase project, the two approved Google accounts, and Google Cloud Drive/Picker configuration from `docs/GOOGLE_DRIVE_SETUP.md`.

## Setup

1. Host and friend Google accounts both exist in the SyncRoom whitelist.
2. Host uploads an MP4 to Google Drive.
3. Host manually shares that file with the friend as Viewer.
4. Both accounts enter the same SyncRoom room.

## Host Source Selection

5. Host chooses Google Drive.
6. Drive consent appears only now.
7. Host selects the MP4.
8. Picker closes.
9. Filename appears in the room.
10. Video loads for the host.

## Friend Access

11. Friend sees Drive source selected.
12. Friend connects Google Drive.
13. If required by `drive.file`, friend grants app access to the exact same file through Picker.
14. Video loads for the friend.

## Synchronization

15. Both click Enable sync.
16. Host presses Play.
17. Both videos start.
18. Let playback run 30 seconds.
19. No rollback occurs.
20. Host presses Pause.
21. Both pause.
22. Host resumes.
23. Both resume.
24. Host seeks +30 seconds.
25. Friend follows.
26. Host intentionally seeks backward.
27. Friend follows.
28. Let playback run another 30 seconds.
29. No drift rollback occurs.

## Range Streaming

30. Seek near the middle of a large video.
31. Confirm the browser performs a Range request.
32. Confirm playback does not download the entire file from byte zero.
33. Seek near the end.
34. Playback resumes.

Development-only service worker logs should show media range/status diagnostics without tokens or emails.

## Chat And Overlays

35. Send a live message while Drive video plays.
36. Message appears instantly.
37. Flowing message appears over the video.
38. Player is not recreated.

## Refresh And Reconnect

39. Refresh the friend browser.
40. Drive reauthorization state appears if required.
41. Reconnect Drive.
42. Video recovers near the host's current position.

## Source Switching

43. Host changes Drive to YouTube.
44. Both switch cleanly.
45. Host changes YouTube to Drive.
46. Both switch cleanly.

## Errors

47. Test an unshared Drive file.
48. Friend sees permission guidance.
49. Test an unsupported video format.
50. Clear unsupported-format error appears.
51. Revoke or expire the token if practical.
52. Reconnect Drive works.

## Mobile

53. Test mobile portrait.
54. Test mobile landscape.
55. Test fullscreen.

## Expected Security Results

- No Drive access token appears in the URL.
- No Drive access token appears in console logs.
- No Drive access token is written to Supabase.
- YouTube still works if Drive environment variables are missing.
- Only the host can change the room source.

## Playback Snapshot Request Count

Before opening SyncRoom against the live Supabase project, reset query stats if `pg_stat_statements` is enabled:

```sql
select pg_stat_statements_reset();
```

1. Open one host browser.
2. Enter a room.
3. Load a YouTube video.
4. Play for 60 seconds without interacting.
5. Query `pg_stat_statements` for `update_room_playback_state`.

Expected periodic calls: approximately 4-5, not hundreds, thousands, or millions.

Then:

6. Add the friend.
7. Play another 60 seconds.
8. Confirm the guest does not double the snapshot count.
9. Perform Play, Pause, and Seek commands.
10. Confirm only reasonable additional command writes appear.
11. Inspect Postgres Logs.

Expected log result: zero repeated `Stale playback state version` errors.
