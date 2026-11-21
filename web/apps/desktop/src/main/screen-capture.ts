import { randomUUID } from "node:crypto"
import type {
  DesktopCapturerSource,
  DisplayMediaRequestHandlerHandlerRequest,
} from "electron"
import type { IpcHost } from "./ipc"
import { CHANNELS } from "../shared/ipc-schema"
import type { CaptureSource } from "../shared/bridge"

/** One-use capture choices. Native source IDs never cross into the renderer. */
export function createScreenCapture(
  getSources: () => Promise<DesktopCapturerSource[]>,
  now = Date.now
) {
  const choices = new Map<string, DesktopCapturerSource>()
  let expires = 0
  let picked: DesktopCapturerSource | undefined
  let generation = 0

  const reset = () => {
    generation++
    choices.clear()
    picked = undefined
    expires = 0
  }

  return {
    reset,
    async sources(): Promise<CaptureSource[]> {
      reset()
      const current = generation
      const sources = await getSources()
      if (current !== generation) return []

      expires = now() + 30_000
      return sources.slice(0, 256).map((source) => {
        const id = randomUUID()
        choices.set(id, source)
        return {
          id,
          name: source.name.slice(0, 256),
          thumbnail: source.thumbnail.toDataURL(),
        }
      })
    },
    pick(id: unknown) {
      picked = undefined
      if (typeof id !== "string" || now() >= expires || !choices.has(id)) {
        reset()
        throw new Error("Choose a screen or window again.")
      }
      picked = choices.get(id)
      choices.clear()
      expires = now() + 10_000
    },
    grant(allowed: boolean): DesktopCapturerSource | undefined {
      const source = allowed && now() < expires ? picked : undefined
      reset()
      return source
    },
  }
}

/** Registers narrow source enumeration and one-use selection behind the window guard. */
export function registerScreenIpc(
  host: IpcHost,
  capture: ReturnType<typeof createScreenCapture>
) {
  host.handle(CHANNELS.screenSources, async (senderOk, args) => {
    if (!senderOk || args.length !== 0)
      throw new Error("Could not choose a screen for this window.")
    return capture.sources()
  })
  host.handle(CHANNELS.pickScreenSource, async (senderOk, args) => {
    if (!senderOk || args.length !== 1)
      throw new Error("Could not choose a screen for this window.")
    capture.pick(args[0])
  })
}

/** Refuses audio and grants exactly the source picked by this window's main frame. */
export function screenRequestAllowed(
  request: DisplayMediaRequestHandlerHandlerRequest,
  frame: unknown
): boolean {
  return (
    request.frame === frame &&
    frame != null &&
    request.videoRequested &&
    !request.audioRequested
  )
}
