import type { ConnectionInfo } from "../../../../shared/bridge"

/** An error whose message is already a plain sentence for the screen. */
export class ApiError extends Error {
  /** Stable code the screen can switch on, such as `no_folder`. */
  readonly code: string
  /** HTTP status, or 0 when the sidecar never answered. */
  readonly status: number

  /** Build an error from the sidecar's `{code, message}` body. */
  constructor(code: string, message: string, status = 0) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.status = status
  }
}

let connection: Promise<ConnectionInfo> | null = null

/** Forget the cached address and token, for example after a sidecar restart. */
export function resetConnection(): void {
  connection = null
}

/** The sidecar address and token. One call is shared until reset. */
export function getConnection(): Promise<ConnectionInfo> {
  connection ??= window.tailshare
    .getConnectionInfo()
    .catch((reason: unknown) => {
      // A failed call must not stay cached, or a retry could never succeed.
      connection = null
      const message =
        reason instanceof Error
          ? reason.message
          : "Tailshare is not responding."
      throw new ApiError("unavailable", message)
    })

  return connection
}

/** Options for {@link apiFetch}. */
export interface ApiOptions {
  /** HTTP method. Defaults to GET. */
  method?: "GET" | "POST" | "PUT" | "DELETE"
  /** Sent as JSON when set. */
  body?: unknown
}

/** Call the local API with the bearer token. Throws {@link ApiError}. */
export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const info = await getConnection()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${info.token}`,
  }
  if (options.body !== undefined) headers["Content-Type"] = "application/json"

  let response: Response
  try {
    response = await fetch(`${info.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError("unavailable", "Tailshare is not responding.")
  }

  // The token changes when the sidecar restarts, so ask for it again next time.
  if (response.status === 401) resetConnection()

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text === "" ? undefined : JSON.parse(text)
  } catch {
    // Not JSON: the generic sentence below covers it.
  }

  if (!response.ok) {
    const body = parsed as { code?: unknown; message?: unknown } | undefined
    const message =
      typeof body?.message === "string"
        ? body.message
        : "Something went wrong. Try again."
    const code = typeof body?.code === "string" ? body.code : "internal"
    throw new ApiError(code, message, response.status)
  }

  return parsed as T
}
