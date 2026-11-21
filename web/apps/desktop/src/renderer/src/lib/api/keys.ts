/** Every query key in one place, so live events and the UI agree. */
export const keys = {
  session: ["session"] as const,
  transfers: ["transfers"] as const,
  chat: ["chat"] as const,
  forwards: ["forwards"] as const,
  live: ["live"] as const,
}
