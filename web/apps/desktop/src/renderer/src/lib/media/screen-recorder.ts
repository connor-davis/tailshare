import { apiFetch } from "../api/client"
import { screenSocket } from "../api/screens"
import type { ScreenItem } from "../api/types"

/** Prefer widely supported VP8; both ends must support the exact WebM MIME type. */
export function screenCodec(): string | undefined {
  return ["video/webm;codecs=vp8", "video/webm;codecs=vp9"].find(
    (codec) =>
      MediaRecorder.isTypeSupported(codec) && MediaSource.isTypeSupported(codec)
  )
}

/** Owns recording resources across tab switches and cancels pending starts on leave. */
export function createScreenRecorder(onError: () => void) {
  let generation = 0
  let stream: MediaStream | undefined
  let socket: WebSocket | undefined
  let recorder: MediaRecorder | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let id: string | undefined

  const stop = () => {
    generation++
    clearTimeout(timer)
    if (recorder && recorder.state !== "inactive") recorder.stop()
    recorder = undefined
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
    socket?.close()
    socket = undefined
    if (id)
      void apiFetch(`/api/screen/${id}`, { method: "DELETE" }).catch(() => {})
    id = undefined
  }
  const fail = () => {
    stop()
    onError()
  }

  return {
    stop,
    async start(sourceId: string) {
      stop()
      const current = generation
      const active = () => generation === current
      try {
        const codec = screenCodec()
        if (!codec) throw new Error("Screen recording is unavailable.")
        await window.tailshare.pickScreenSource(sourceId)
        if (!active()) return

        const captured = await navigator.mediaDevices.getDisplayMedia({
          audio: false,
          video: true,
        })
        if (!active()) {
          captured.getTracks().forEach((track) => track.stop())
          return
        }
        stream = captured
        const track = captured.getVideoTracks()[0]!
        track.addEventListener("ended", stop, { once: true })
        await track.applyConstraints({
          width: { max: 1920 },
          height: { max: 1080 },
          frameRate: { max: 15 },
        })
        if (!active()) return

        const item = await apiFetch<ScreenItem>("/api/screen", {
          method: "POST",
          body: { codec },
        })
        if (!active()) {
          void apiFetch(`/api/screen/${item.id}`, { method: "DELETE" }).catch(
            () => {}
          )
          return
        }
        id = item.id
        const connected = await screenSocket(`/api/screen/ingest/${item.id}`)
        if (!active()) {
          connected.close()
          return
        }
        socket = connected
        connected.onclose = connected.onerror = () => {
          if (active()) fail()
        }

        // Each short recording starts with an init segment and keyframe. Retain only
        // that epoch on the sidecar so a late viewer can start without missing frames.
        const record = () => {
          if (!active()) return
          const next = new MediaRecorder(captured, {
            mimeType: codec,
            videoBitsPerSecond: 2_500_000,
          })
          recorder = next
          let first = true
          let pending = 0
          let queued = Promise.resolve()
          next.ondataavailable = (event) => {
            if (!active() || !event.data.size) return
            const flag = first ? 1 : 0
            first = false
            pending += event.data.size
            if (pending > 4_194_304 || event.data.size > 1_048_575) {
              fail()
              return
            }
            queued = queued
              .then(async () => {
                const bytes = new Uint8Array(await event.data.arrayBuffer())
                pending -= bytes.length
                if (!active()) return
                if (
                  connected.readyState !== WebSocket.OPEN ||
                  connected.bufferedAmount + bytes.length > 4_194_304
                )
                  throw new Error("Screen connection is too slow.")
                const message = new Uint8Array(bytes.length + 1)
                message[0] = flag
                message.set(bytes, 1)
                connected.send(message)
              })
              .catch(() => {
                if (active()) fail()
              })
          }
          next.onerror = () => {
            if (active()) fail()
          }
          next.onstop = () => {
            void queued
              .then(() => {
                if (active()) record()
              })
              .catch(() => {
                if (active()) fail()
              })
          }
          next.start(250)
          timer = setTimeout(() => {
            if (next.state !== "inactive") next.stop()
          }, 2_000)
        }
        record()
      } catch {
        if (active()) fail()
      }
    },
  }
}
