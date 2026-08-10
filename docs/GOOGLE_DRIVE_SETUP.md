# Google Drive Setup

This setup is for SyncRoom's private two-person Google Drive playback. Normal SyncRoom login still uses Supabase Auth with Google OAuth and must not request Drive scopes.

## Google Cloud

Use the existing Google Cloud project for SyncRoom.

Enable these APIs:

- Google Drive API
- Google Picker API

## OAuth Client

Use the existing Web OAuth client, for example `SyncRoom Web`.

Add Authorized JavaScript origins:

- `http://localhost:5173`
- `https://sync-room-virid.vercel.app`

Do not remove the existing Supabase redirect URI used by Supabase Auth.

Keep the OAuth app Publishing Status as `Testing`.

Add the owner and every currently approved guest as OAuth test users while the app remains in Testing mode.

SyncRoom requests only this Drive scope during the explicit Drive flow:

```text
https://www.googleapis.com/auth/drive.file
```

Do not add the OAuth Client Secret to frontend environment files or repository files.

## Picker API Key

Create a Google API key for Picker.

The key is a public browser identifier, not a client secret. It must always be API-restricted to Google Picker API only. SyncRoom now passes `window.location.origin` to `PickerBuilder.setOrigin()`.

Current validated v1 configuration:

- Application restriction: None
- API restriction: Google Picker API only

Post-release hardening to retest in Google Cloud before enforcement:

- Application restriction: HTTP referrers
- Local referrer: `http://localhost:5173/*`
- Production referrer: `https://sync-room-virid.vercel.app/*`
- API restriction: Google Picker API

Previous referrer-restricted testing returned "The API developer key is invalid", so do not change the working production restriction without a two-browser Picker test. Never place a private credential in the browser as a substitute.

## Project Number

Copy the Google Cloud Project Number into `VITE_GOOGLE_APP_ID`. This is the numeric project identifier used by `PickerBuilder.setAppId()`.

## Local Environment

Add these to `.env.local`:

```bash
VITE_GOOGLE_CLIENT_ID=...
VITE_GOOGLE_PICKER_API_KEY=...
VITE_GOOGLE_APP_ID=...
```

Never add:

```bash
GOOGLE_CLIENT_SECRET=...
```

## Drive File Sharing

The host must manually share the video file with the intended guest in Google Drive as a Viewer.

SyncRoom does not change Drive permissions, does not call `permissions.create`, and does not require public files or "Anyone with the link" sharing.
