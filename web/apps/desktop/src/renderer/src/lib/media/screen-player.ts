import { screenSocket } from "../api/screens"
import type { ScreenItem } from "../api/types"

/** Plays bounded epochs in order, trims old frames and follows the live edge. */
export function playScreen(
  video: HTMLVideoElement,
  item: Pick<ScreenItem, "id" | "codec">,
  onError: () => void
) {
  let socket: WebSocket | undefined
  let stopped = false
  let buffer: SourceBuffer | undefined
  const media = new MediaSource()
  const url = URL.createObjectURL(media)
  const queue: Uint8Array<ArrayBuffer>[] = []
  let queuedBytes = 0
  let needsInit = true
  video.src = url

  const stop = () => {
    stopped = true
    socket?.close()
    queue.length = 0
    video.pause()
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(url)
  }
  const fail = () => {
    if (!stopped) {
      stop()
      onError()
    }
  }
  const drain = () => {
    if (stopped || !buffer || buffer.updating) return
    try {
      const ranges = buffer.buffered
      if (ranges.length) {
        const end = ranges.end(ranges.length - 1)
        if (end - video.currentTime > 1.5)
          video.currentTime = Math.max(0, end - 0.3)
        if (
          video.currentTime > 12 &&
          ranges.start(0) < video.currentTime - 10
        ) {
          buffer.remove(0, video.currentTime - 10)
          return
        }
      }
      const chunk = queue.shift()
      if (!chunk) return
      queuedBytes -= chunk.byteLength
      // Each recorder epoch starts its timestamps at zero. Move its whole timeline
      // after the previous one, without resetting the video or growing an archive.
      if (chunk[0] === 1 && ranges.length) {
        const end = ranges.end(ranges.length - 1)
        // WebM clusters can have unknown lengths, leaving MSE in its parsing
        // state even after updateend. Reset that parser before changing offset.
        buffer.abort()
        buffer.timestampOffset = end
      }
      buffer.appendBuffer(chunk.subarray(1))
    } catch {
      fail()
    }
  }
  media.addEventListener(
    "sourceopen",
    () => {
      if (stopped) return
      try {
        if (!MediaSource.isTypeSupported(item.codec)) {
          fail()
          return
        }
        buffer = media.addSourceBuffer(item.codec)
        buffer.addEventListener("updateend", drain)
        buffer.addEventListener("error", fail)
        void video.play().catch(fail)
        void screenSocket(`/api/screen/watch/${item.id}`)
          .then((connected) => {
            if (stopped) {
              connected.close()
              return
            }
            socket = connected
            connected.onclose = connected.onerror = fail
            connected.onmessage = (event: MessageEvent<ArrayBuffer>) => {
              if (stopped) return
              const chunk = new Uint8Array(event.data)
              if (
                (needsInit && chunk[0] !== 1) ||
                chunk.byteLength < 2 ||
                chunk.byteLength > 1_048_576 ||
                chunk[0]! > 1 ||
                queuedBytes + chunk.byteLength > 4_194_304 ||
                queue.length >= 32
              ) {
                fail()
                return
              }
              needsInit = false
              queue.push(chunk)
              queuedBytes += chunk.byteLength
              drain()
            }
          })
          .catch(fail)
      } catch {
        fail()
      }
    },
    { once: true }
  )
  return stop
}
