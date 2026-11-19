import { Schema } from "effect"

const HealthReply = Schema.Struct({ status: Schema.Literal("ok") })

/** The shape of `fetch` that {@link checkHealth} needs, so tests can fake it. */
export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{ status: number; json(): Promise<unknown> }>

/**
 * Asks the sidecar `GET /api/health` with the token. Resolves only for a 200
 * reply whose body says `"status":"ok"`; anything else rejects with a plain
 * sentence. One attempt, capped at two seconds.
 */
export async function checkHealth(
  baseUrl: string,
  token: string,
  fetchFn: FetchLike = fetch
): Promise<void> {
  const reply = await fetchFn(`${baseUrl}/api/health`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(2000),
  })
  if (reply.status !== 200) {
    throw new Error(`health check answered ${reply.status}`)
  }

  const body = await reply.json()
  Schema.decodeUnknownSync(HealthReply)(body)
}
