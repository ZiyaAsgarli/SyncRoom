export const PRODUCT = {
  appName: import.meta.env.VITE_APP_NAME || "SyncRoom",
  logoText: "SyncRoom",
  tagline: "Just us, perfectly in sync.",
  description: "A private two-person watch room for shared video nights.",
  privateNotice: "Only accounts approved by the owner can enter."
} as const;
