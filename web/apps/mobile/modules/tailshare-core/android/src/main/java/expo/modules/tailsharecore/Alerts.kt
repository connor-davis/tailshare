package expo.modules.tailsharecore

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONObject

// All system notification words stay here because these notifications run without JavaScript.
internal object NoticeText {
  const val roomChannel = "Room"
  const val alertsChannel = "Messages and files"
  const val app = "Tailshare"
  const val closed = "The room has closed."
  const val done = "File sent."
  const val downloaded = "File saved."
  const val failed = "File transfer failed."
  fun room(name: String) = "In room $name"
}

/** System notification construction and background-only alerts for one live room. */
internal class Alerts(private val context: Context) {
  private val manager = context.getSystemService(NotificationManager::class.java)
  private val finished = HashMap<String, String>()
  private var nextId = 2
  private var ended = false

  init { channels(context) }

  fun chat(event: JSONObject, background: Boolean) {
    if (ended || !background || event.optString("type") != "chat" || event.optBoolean("mine") ||
      event.optBoolean("history")) return

    post(event.optString("fromName"), event.optString("text"), "chat")
  }

  fun transfer(event: JSONObject, background: Boolean) {
    if (ended) return
    val state = event.optString("state")
    if (state != "done" && state != "failed") return
    val id = event.optString("id")
    if (finished.put(id, state) == state || !background) return

    val result = if (state == "failed") NoticeText.failed
      else if (event.optString("direction") == "download") NoticeText.downloaded else NoticeText.done
    post(event.optString("saved", event.optString("name")), result, "transfers")
  }

  fun closed(background: Boolean) {
    if (ended) return
    ended = true
    clear()
    if (background) post(NoticeText.app, NoticeText.closed, "home")
  }

  fun clear() {
    // Query our own notices so cleanup also removes alerts left by a killed process.
    manager.activeNotifications.filter { it.tag == "alerts" }
      .forEach { manager.cancel(it.tag, it.id) }
    nextId = 2
    finished.clear()
  }

  private fun post(title: String, text: String, tab: String) {
    if (Build.VERSION.SDK_INT >= 33 &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return

    try {
      manager.notify("alerts", nextId++, builder(context, "alerts")
        .setContentTitle(title).setContentText(text).setAutoCancel(true)
        .setContentIntent(open(context, tab)).build())
    } catch (error: SecurityException) {
      // Permission may be revoked between the check and posting; the room still works.
    }
  }

  companion object {
    const val TAB = "tailshare.tab"
    const val ROOM_ID = 1

    fun channels(context: Context) {
      if (Build.VERSION.SDK_INT >= 26) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("room", NoticeText.roomChannel, NotificationManager.IMPORTANCE_LOW))
        manager.createNotificationChannel(NotificationChannel("alerts", NoticeText.alertsChannel, NotificationManager.IMPORTANCE_DEFAULT))
      }
    }

    @Suppress("DEPRECATION")
    fun builder(context: Context, channel: String): Notification.Builder {
      val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, channel)
        else Notification.Builder(context).setPriority(if (channel == "room") Notification.PRIORITY_LOW else Notification.PRIORITY_DEFAULT)
      return builder.setSmallIcon(android.R.drawable.stat_sys_upload)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
    }

    fun open(context: Context, tab: String): PendingIntent? {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
      intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      intent.putExtra(TAB, tab)
      return PendingIntent.getActivity(context, tab.hashCode(), intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
  }
}
