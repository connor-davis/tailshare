/** Every query key in one place, so live events and screens agree. */
export const keys = {
  session: ["session"] as const,
  folder: ["folder"] as const,
  transfers: ["transfers"] as const,
  chat: ["chat"] as const,
  live: ["live"] as const,
  files: ["files"] as const,
  filesPage: (side: string, path: string, offset: number) =>
    ["files", side, path, offset] as const,
}
