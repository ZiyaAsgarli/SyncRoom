export type RoomMediaSource =
  | {
      type: "youtube";
      videoId: string;
    }
  | {
      type: "google_drive";
      fileId: string;
      name: string;
      mimeType: "video/mp4" | "video/webm";
      size: number | null;
      modifiedTime: string | null;
    };
