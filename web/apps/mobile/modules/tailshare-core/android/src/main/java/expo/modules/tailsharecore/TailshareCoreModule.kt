package expo.modules.tailsharecore

import android.content.ContentValues
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import tailshare.Client
import tailshare.Tailshare
import org.json.JSONObject
import java.io.File
import kotlin.concurrent.thread

/** Thin bridge from JavaScript to the Go core built by gomobile. */
class TailshareCoreModule : Module() {
  private var client: Client? = null
  private var downloadsDir: File? = null

  // Finished downloads already copied out, by transfer id, so a replayed event copies once.
  private val saved = HashMap<String, String>()

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

  // Blocks on the Go core until the host says something, then hands it to JavaScript.
  // Leave makes the blocked call return, so the thread ends with the room.
  private fun pumpEvents(current: Client) {
    thread(name = "tailshare-events") {
      try {
        while (true) {
          val json = current.nextEvent()
          sendEvent("onRoomEvent", mapOf("json" to json))
          if (json.contains("\"closed\"")) break
        }
      } catch (error: Exception) {
        // The core returns an error once the room is gone; that ends the loop.
      }
    }
  }

  // Copies a finished download into the system Downloads folder (no permission on Android 10+)
  // and returns the name it got there; the system renames a repeat to "name (1)".
  private fun saveToDownloads(file: File): String {
    val context = appContext.reactContext!!
    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, file.name)
      put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
    }
    val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
      ?: throw IllegalStateException("Could not save to Downloads.")
    context.contentResolver.openOutputStream(uri)!!.use { out -> file.inputStream().use { it.copyTo(out) } }
    val name = context.contentResolver.query(uri, arrayOf(MediaStore.Downloads.DISPLAY_NAME), null, null, null)
      ?.use { if (it.moveToFirst()) it.getString(0) else null } ?: file.name
    file.delete()
    return name
  }

  // Same loop as pumpEvents, for file progress. A finished download is copied to Downloads
  // first, and its event then carries "saved": the final name.
  private fun pumpTransfers(current: Client) {
    thread(name = "tailshare-transfers") {
      try {
        while (true) {
          val event = JSONObject(current.nextTransferEvent())
          if (event.optString("direction") == "download") {
            val id = event.optString("id")
            if (event.optString("state") == "done") {
              try {
                event.put("saved", saved.getOrPut(id) { saveToDownloads(File(downloadsDir, event.getString("name"))) })
              } catch (error: Exception) {
                event.put("state", "failed").put("reason", "Could not save to Downloads.")
              }
            }
          }
          sendEvent("onTransferEvent", mapOf("json" to event.toString()))
          if (event.optString("type") == "closed") break
        }
      } catch (error: Exception) {
        // The core returns an error once transfers are gone; that ends the loop.
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("TailshareCore")

    Events("onRoomEvent", "onTransferEvent")

    AsyncFunction("join") { code: String, name: String, promise: Promise ->
      val fresh = Tailshare.newClient(name, "", 0L)
      client = fresh
      background(promise, "ERR_JOIN") {
        fresh.join(code)
        pumpEvents(fresh)
      }
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

    // Kotlin picks the folders so JavaScript never handles paths: files to send sit in the
    // cache (where the picker copies them), downloads land in app storage until copied out.
    AsyncFunction("enableTransfers") { promise: Promise ->
      val current = client
      val context = appContext.reactContext
      if (current == null || context == null) {
        promise.reject("ERR_TRANSFER", "This phone is not connected.", null)
      } else {
        val inbox = File(context.filesDir, "downloads").apply { mkdirs() }
        downloadsDir = inbox
        background(promise, "ERR_TRANSFER") {
          current.enableTransfers(context.cacheDir.canonicalPath, inbox.canonicalPath)
          pumpTransfers(current)
        }
      }
    }

    AsyncFunction("download") { remote: String, promise: Promise ->
      val current = client
      if (current == null) {
        promise.reject("ERR_TRANSFER", "This phone is not connected.", null)
      } else {
        background(promise, "ERR_TRANSFER") { current.download(remote) }
      }
    }

    AsyncFunction("upload") { localPath: String, remoteDir: String, promise: Promise ->
      val current = client
      if (current == null) {
        promise.reject("ERR_TRANSFER", "This phone is not connected.", null)
      } else {
        // Canonical paths, so /data/data and /data/user/0 spellings of the cache still match.
        background(promise, "ERR_TRANSFER") { current.upload(File(localPath).canonicalPath, remoteDir) }
      }
    }

    AsyncFunction("leave") { promise: Promise ->
      val current = client
      client = null
      background(promise, "ERR_LEAVE") { current?.leave() }
    }
  }
}
