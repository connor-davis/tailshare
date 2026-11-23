package expo.modules.tailsharecore

import android.Manifest
import android.content.Context
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import tailshare.Client
import tailshare.Tailshare
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import kotlin.concurrent.thread

/** Thin bridge from JavaScript to the Go core built by gomobile. */
class TailshareCoreModule : Module() {
  @Volatile private var client: Client? = null
  private val roomLock = Any()
  private var alerts: Alerts? = null
  private var nativeContext: Context? = null
  @Volatile private var backgrounded = false

  private fun stopRoom(closed: Boolean = false) {
    val context = nativeContext ?: return
    RoomService.stop(context)
    if (closed) alerts?.closed(backgrounded) else (alerts ?: Alerts(context)).clear()
    if (!closed) alerts = null
  }

  // Consume the extra itself, so even a recreated module cannot route an old tap again.
  private var openListening = false
  private var pendingOpen: String? = null
  private fun handleOpen(intent: Intent?) {
    val tab = intent?.getStringExtra(Alerts.TAB) ?: return
    intent.removeExtra(Alerts.TAB)
    if (tab !in listOf("home", "chat", "transfers")) return
    synchronized(roomLock) {
      if (openListening) sendEvent("onOpenEvent", mapOf("tab" to tab)) else pendingOpen = tab
    }
  }
  private var downloadsDir: File? = null
  // The client whose chat pump runs, so a second watchChat does not start another.
  private var chatPumped: Client? = null

  // Finished downloads already copied out, by transfer id, so a replayed event copies once.
  private val saved = HashMap<String, String>()

  private val roomsLock = Any()

  private fun roomPreferences() = (appContext.reactContext?.applicationContext
    ?: throw IllegalStateException("The app has closed."))
    .getSharedPreferences("rooms", Context.MODE_PRIVATE)

  private fun savedRooms(): List<JSONObject> {
    val records = JSONArray(roomPreferences().getString("records", "[]") ?: "[]")

    // Rebuild records from the allowed fields so this bridge never returns extra stored data.
    return (0 until records.length()).mapNotNull { index ->
      val record = records.optJSONObject(index) ?: return@mapNotNull null
      val name = record.optString("name")
      val role = record.optString("role")
      val lastOpen = record.optLong("lastOpen", -1L)
      if (name.isBlank() || role !in listOf("host", "joined") || lastOpen < 0L) {
        return@mapNotNull null
      }

      JSONObject().put("name", name).put("role", role).put("lastOpen", lastOpen)
    }.distinctBy { it.getString("name") }.sortedByDescending { it.getLong("lastOpen") }
  }

  private fun storeRooms(records: List<JSONObject>) {
    // ponytail: keep 50 recent names to bound phone storage. Add paging if a larger history is needed.
    val recent = records.sortedByDescending { it.getLong("lastOpen") }.take(50)
    roomPreferences().edit().putString("records", JSONArray(recent).toString()).apply()
  }

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
          val closed = JSONObject(json).optString("type") == "closed"
          synchronized(roomLock) {
            if (client !== current) return@thread
            if (closed) {
              stopRoom(closed = true)
              client = null
            }
            sendEvent("onRoomEvent", mapOf("json" to json))
          }
          if (closed) {
            current.leave()
            break
          }
        }
      } catch (error: Exception) {
        synchronized(roomLock) {
          if (client === current) {
            stopRoom(closed = true)
            client = null
            sendEvent("onRoomEvent", mapOf("json" to "{\"type\":\"closed\"}"))
          }
        }
        runCatching { current.leave() }
      }
    }
  }

  // Same loop again for chat. The type field decides "closed", never the text of a message.
  private fun pumpChat(current: Client) {
    thread(name = "tailshare-chat") {
      try {
        while (true) {
          val json = current.nextChatEvent()
          synchronized(roomLock) {
            if (client !== current) return@thread
            alerts?.chat(JSONObject(json), backgrounded)
            sendEvent("onChatEvent", mapOf("json" to json))
          }
          if (JSONObject(json).optString("type") == "closed") break
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
          synchronized(roomLock) {
            if (client !== current) return@thread
            alerts?.transfer(event, backgrounded)
            sendEvent("onTransferEvent", mapOf("json" to event.toString()))
          }
          if (event.optString("type") == "closed") break
        }
      } catch (error: Exception) {
        // The core returns an error once transfers are gone; that ends the loop.
      }
    }
  }

  // The last share intent handled, so entering the foreground again does not copy it twice.
  private var lastShareIntent: Intent? = null
  private var shareListening = false
  // Shares that arrived before JavaScript listened (a cold start from the share sheet).
  private val unsentShares = ArrayList<Map<String, Any>>()

  // The URIs a share carries: one for SEND, many for SEND_MULTIPLE, clipData as a fallback.
  @Suppress("DEPRECATION")
  private fun sharedUris(intent: Intent): List<Uri> {
    // Read by action: the untyped reads below API 33 do not check the type, so asking SEND_MULTIPLE
    // for one Uri would hand back the whole list as a fake file.
    val many = intent.action == Intent.ACTION_SEND_MULTIPLE
    val found: List<Uri> = if (Build.VERSION.SDK_INT >= 33) {
      if (many) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList()
      else listOfNotNull(intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java))
    } else {
      if (many) intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList()
      else listOfNotNull(intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
    }
    if (found.isNotEmpty()) return found
    val clip = intent.clipData ?: return emptyList()
    return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
  }

  // Copies each shared file into its own batch folder in the cache (Go only sends files under
  // the cache) and returns the paths. A file that cannot be read is counted, never dropped.
  private fun copyShared(uris: List<Uri>): Map<String, Any> {
    val context = appContext.reactContext!!
    val batch = File(context.cacheDir, "share/${UUID.randomUUID()}").apply { mkdirs() }
    val paths = ArrayList<String>()
    var failed = 0
    uris.forEachIndexed { index, uri ->
      try {
        // Only content:// is read, so a share can never point us at the app's own files.
        if (uri.scheme != "content") throw IllegalArgumentException("Not a content URI.")
        val shown = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
          ?.use { if (it.moveToFirst()) it.getString(0) else null }
        // File(..).name drops any folders a display name might carry.
        var name = File(shown ?: "shared-file-$index").name
        if (File(batch, name).exists()) name = "$index-$name"
        val file = File(batch, name)
        context.contentResolver.openInputStream(uri)!!.use { input ->
          file.outputStream().use { input.copyTo(it) }
        }
        paths.add(file.canonicalPath)
      } catch (error: Exception) {
        failed++
      }
    }
    return mapOf("type" to "share", "paths" to paths, "failed" to failed)
  }

  // Handles one share intent once. Text shares have no stream and are ignored.
  private fun handleShare(intent: Intent?) {
    if (intent == null || intent === lastShareIntent) return
    if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return
    lastShareIntent = intent
    val uris = sharedUris(intent)
    if (uris.isEmpty()) return
    thread(name = "tailshare-share") {
      val share = copyShared(uris)
      synchronized(unsentShares) {
        if (shareListening) sendEvent("onShareEvent", share) else unsentShares.add(share)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("TailshareCore")

    Events("onRoomEvent", "onTransferEvent", "onChatEvent", "onShareEvent", "onOpenEvent")

    OnCreate {
      nativeContext = appContext.reactContext?.applicationContext
      // A newly created module has no room; discard any notices from the old process.
      stopRoom()
      // ponytail: shared copies stay in the cache until the next app start. Upgrade: delete
      // each batch once its uploads are done.
      appContext.reactContext?.let { File(it.cacheDir, "share").deleteRecursively() }
      handleShare(appContext.currentActivity?.intent)
      handleOpen(appContext.currentActivity?.intent)
    }

    // A cold start from the share sheet has no activity yet in OnCreate, so look again here.
    OnActivityEntersForeground {
      backgrounded = false
      handleShare(appContext.currentActivity?.intent)
      handleOpen(appContext.currentActivity?.intent)
    }
    OnActivityEntersBackground { backgrounded = true }

    OnDestroy {
      val current = synchronized(roomLock) {
        val previous = client
        client = null
        stopRoom()
        previous
      }
      current?.cancel()
      thread(name = "tailshare-close") { current?.leave() }
    }

    // The app was already open and the share sheet reused it.
    OnNewIntent { intent ->
      handleShare(intent)
      handleOpen(intent)
    }

    Function("watchOpen") {
      synchronized(roomLock) {
        openListening = true
        pendingOpen?.let { sendEvent("onOpenEvent", mapOf("tab" to it)) }
        pendingOpen = null
      }
    }

    AsyncFunction("requestNotifications") { promise: Promise ->
      val context = appContext.reactContext
      if (Build.VERSION.SDK_INT < 33 || context == null) {
        promise.resolve(null)
      } else {
        val preferences = context.getSharedPreferences("notifications", Context.MODE_PRIVATE)
        if (preferences.getBoolean("asked", false)) {
          promise.resolve(null)
        } else {
          preferences.edit().putBoolean("asked", true).apply()
          Permissions.askForPermissionsWithPermissionsManager(
            appContext.permissions, promise, Manifest.permission.POST_NOTIFICATIONS)
        }
      }
    }

    // Started by the screen once it listens; sends any share that came in before that.
    Function("watchShare") {
      synchronized(unsentShares) {
        shareListening = true
        unsentShares.forEach { sendEvent("onShareEvent", it) }
        unsentShares.clear()
      }
    }

    AsyncFunction("join") { code: String, name: String, promise: Promise ->
      val fresh = Tailshare.newClient(name, "", 0L)
      val previous = synchronized(roomLock) {
        stopRoom()
        val old = client
        client = fresh
        old
      }
      background(promise, "ERR_JOIN") {
        try {
          previous?.cancel()
          previous?.leave()
          fresh.join(code)
          synchronized(roomLock) {
            if (client !== fresh) throw IllegalStateException("Joining was cancelled.")
            val context = appContext.reactContext?.applicationContext
              ?: throw IllegalStateException("The app has closed.")
            nativeContext = context
            alerts = Alerts(context)
            RoomService.start(context, fresh.roomName())
            pumpEvents(fresh)
          }
        } catch (error: Exception) {
          synchronized(roomLock) {
            if (client === fresh) {
              client = null
              stopRoom()
            }
          }
          runCatching { fresh.leave() }
          throw error
        }
      }
    }

    // Started by the screen once it listens, so the history replay is not sent to nobody.
    Function("watchChat") {
      val current = client
      if (current != null && chatPumped !== current) {
        chatPumped = current
        pumpChat(current)
      }
    }

    AsyncFunction("sendChat") { text: String, promise: Promise ->
      val current = client
      if (current == null) {
        promise.reject("ERR_CHAT", "This phone is not connected.", null)
      } else {
        background(promise, "ERR_CHAT") { current.sendChat(text) }
      }
    }

    Function("cancel") { client?.cancel() }

    Function("listSavedRooms") {
      synchronized(roomsLock) { JSONArray(savedRooms()).toString() }
    }

    Function("saveRoom") { name: String, role: String ->
      require(name.isNotBlank()) { "The room needs a name." }
      require(role in listOf("host", "joined")) { "The room role is not supported." }

      synchronized(roomsLock) {
        val record = JSONObject().put("name", name).put("role", role)
          .put("lastOpen", System.currentTimeMillis())
        storeRooms(listOf(record) + savedRooms().filter { it.getString("name") != name })
      }
    }

    Function("forgetRoom") { name: String ->
      synchronized(roomsLock) {
        storeRooms(savedRooms().filter { it.getString("name") != name })
      }
    }

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
      val current = synchronized(roomLock) {
        val previous = client
        client = null
        stopRoom()
        previous
      }
      background(promise, "ERR_LEAVE") { current?.leave() }
    }
  }
}
