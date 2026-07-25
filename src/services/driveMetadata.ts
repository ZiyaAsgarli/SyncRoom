import { z } from "zod";

export const SUPPORTED_DRIVE_VIDEO_MIME_TYPES = ["video/mp4", "video/webm"] as const;

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: "video/mp4" | "video/webm";
  size: number | null;
  modifiedTime: string | null;
  canDownload: boolean;
  webViewLink?: string | null;
  resourceKey?: string | null;
}

const driveFileIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,200}$/, "Invalid Drive file id.");

const rawDriveMetadataSchema = z.object({
  id: driveFileIdSchema,
  name: z.string().trim().min(1).max(180),
  mimeType: z.enum(SUPPORTED_DRIVE_VIDEO_MIME_TYPES),
  size: z.string().optional(),
  modifiedTime: z.string().datetime().optional(),
  capabilities: z.object({ canDownload: z.boolean() }),
  webViewLink: z.string().url().optional(),
  resourceKey: z.string().optional()
});

export function isValidDriveFileId(value: string): boolean {
  return driveFileIdSchema.safeParse(value).success;
}

export function normalizeDriveMetadata(input: unknown): DriveFileMetadata {
  const parsed = rawDriveMetadataSchema.safeParse(input);
  if (!parsed.success) throw new Error("This is not a supported Drive video file.");
  let size: number | null = null;
  if (parsed.data.size !== undefined) {
    const parsedSize = Number(parsed.data.size);
    if (!Number.isFinite(parsedSize) || parsedSize < 0) {
      throw new Error("Drive file size is invalid.");
    }
    size = parsedSize;
  }
  if (!parsed.data.capabilities.canDownload) {
    throw new Error("This Drive file does not allow downloading/playback through SyncRoom.");
  }
  return {
    id: parsed.data.id,
    name: parsed.data.name,
    mimeType: parsed.data.mimeType,
    size,
    modifiedTime: parsed.data.modifiedTime ?? null,
    canDownload: parsed.data.capabilities.canDownload,
    webViewLink: parsed.data.webViewLink ?? null,
    resourceKey: parsed.data.resourceKey ?? null
  };
}

export function validateGuestSelectedExpectedFile(selectedFileId: string, expectedFileId: string): void {
  if (selectedFileId !== expectedFileId) {
    throw new Error("Please select the exact Drive file chosen by the host.");
  }
}

export async function fetchDriveFileMetadata(accessToken: string, fileId: string): Promise<DriveFileMetadata> {
  if (!isValidDriveFileId(fileId)) throw new Error("Invalid Drive file id.");
  const fields = "id,name,mimeType,size,modifiedTime,capabilities(canDownload),webViewLink,resourceKey";
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=false`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw mapDriveResponseError(response.status);
  return normalizeDriveMetadata(await response.json());
}

export function mapDriveResponseError(status: number): Error {
  if (status === 401) return new Error("Drive authorization expired.");
  if (status === 403) return new Error("This video is not shared with your Google account.");
  if (status === 404) return new Error("Drive file unavailable.");
  if (status === 416) return new Error("Drive range request failed.");
  return new Error("Drive request failed.");
}
