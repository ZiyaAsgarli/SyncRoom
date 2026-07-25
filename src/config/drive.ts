export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file" as const;

export interface DriveEnvironment {
  configured: boolean;
  clientId: string;
  pickerApiKey: string;
  appId: string;
  missing: string[];
}

export function getDriveEnvironment(): DriveEnvironment {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  const pickerApiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY || "";
  const appId = import.meta.env.VITE_GOOGLE_APP_ID || "";
  const missing = [
    ["VITE_GOOGLE_CLIENT_ID", clientId],
    ["VITE_GOOGLE_PICKER_API_KEY", pickerApiKey],
    ["VITE_GOOGLE_APP_ID", appId]
  ].filter(([, value]) => !value).map(([key]) => key);
  return { configured: missing.length === 0, clientId, pickerApiKey, appId, missing };
}
