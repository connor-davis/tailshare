package expo.modules.tailsharecore

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** Keeps the module's Go client in a foreground process while a room is open. */
class RoomService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    Alerts.channels(this)
    val notification = Alerts.builder(this, "room")
      .setContentTitle(NoticeText.room(intent?.getStringExtra("room") ?: ""))
      .setOngoing(true).setContentIntent(Alerts.open(this, "home")).build()

    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(Alerts.ROOM_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(Alerts.ROOM_ID, notification)
    }
    // A restarted process has no Go room to keep alive.
    return START_NOT_STICKY
  }

  // Android 15 gives dataSync services a short grace period to stop after their time limit.
  override fun onTimeout(startId: Int, fgsType: Int) {
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  companion object {
    fun start(context: Context, name: String) {
      val intent = Intent(context, RoomService::class.java).putExtra("room", name)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent)
      else context.startService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, RoomService::class.java))
    }
  }
}
