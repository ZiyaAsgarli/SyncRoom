export const ROUTES = {
  dashboard: "/",
  login: "/login",
  accessDenied: "/access-denied",
  join: (inviteCode = ":inviteCode") => `/join/${inviteCode}`,
  room: (roomId = ":roomId") => `/room/${roomId}`
} as const;
