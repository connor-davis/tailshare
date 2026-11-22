package expo.modules.tailsharecore

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import tailshare.Client
import tailshare.Tailshare
import kotlin.concurrent.thread

/** Thin bridge from JavaScript to the Go core built by gomobile. */
class TailshareCoreModule : Module() {
  private var client: Client? = null

  // Go calls can block for a minute (waiting for the host), so each runs on its own thread.
  private fun background(promise: Promise, code: String, work: () -> Any?) {
    thread(name = "tailshare-$code") {
      try {
        val result = work()
        promise.resolve(if (result is Unit) null else result)
      } catch (error: Exception) {
        promise.reject(code, error.message ?: "Something went wrong.", error)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("TailshareCore")

    AsyncFunction("join") { code: String, name: String, promise: Promise ->
      val fresh = Tailshare.newClient(name, "", 0L)
      client = fresh
      background(promise, "ERR_JOIN") { fresh.join(code) }
    }

    Function("cancel") { client?.cancel() }

    Function("roomName") { client?.roomName() ?: "" }

    Function("connected") { client?.connected() ?: false }

    AsyncFunction("listRemote") { dir: String, promise: Promise ->
      val current = client
      if (current == null) {
        promise.reject("ERR_LIST", "This phone is not connected.", null)
      } else {
        background(promise, "ERR_LIST") { current.listRemote(dir) }
      }
    }

    AsyncFunction("leave") { promise: Promise ->
      val current = client
      client = null
      background(promise, "ERR_LEAVE") { current?.leave() }
    }
  }
}
