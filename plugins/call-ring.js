// Rings like a phone call while PING is closed: call pushes become an insistent, full-screen notification
// that loops the ringtone until answered, cancelled by the caller, or 45 s pass. Other pushes go to expo-notifications.
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const SERVICE = `package com.kiran.ping

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.media.AudioAttributes
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

class CallMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data["body"]?.let { runCatching { JSONObject(it) }.getOrNull() }
    val nm = getSystemService(NotificationManager::class.java)
    when {
      data?.optBoolean("hush") == true -> nm.cancel(TAG, ID)
      data?.optBoolean("call") == true -> if (!visible()) ring(nm, data.optString("text", "Incoming call"))
      else -> super.onMessageReceived(remoteMessage)
    }
  }

  // On screen, the app rings itself from the offer it already has.
  private fun visible(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  private fun ring(nm: NotificationManager, text: String) {
    if (nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Calls", NotificationManager.IMPORTANCE_HIGH).apply {
        setSound(
          Uri.parse("android.resource://$packageName/raw/ring"),
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 600, 900, 600, 900, 600, 900, 600)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      })
    }
    val open = PendingIntent.getActivity(
      this, 0, packageManager.getLaunchIntentForPackage(packageName),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName).takeIf { it != 0 } ?: applicationInfo.icon
    val n = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(icon)
      .setColor(0xFFC6FF3A.toInt())
      .setContentTitle("PING")
      .setContentText(text)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)
      .setAutoCancel(true)
      .setTimeoutAfter(45_000)
      .build()
    n.flags = n.flags or Notification.FLAG_INSISTENT
    nm.notify(TAG, ID, n)
  }

  companion object {
    const val CHANNEL = "calls"
    const val TAG = "ping-call"
    const val ID = 1
  }
}
`;

module.exports = (config) => {
  config = withDangerousMod(config, [
    'android',
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/java/com/kiran/ping');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'CallMessagingService.kt'), SERVICE);
      return c;
    },
  ]);
  config = withAppBuildGradle(config, (c) => {
    const dep = "implementation 'com.google.firebase:firebase-messaging:25.0.1'";
    if (!c.modResults.contents.includes(dep)) c.modResults.contents = c.modResults.contents.replace(/dependencies \{\n/, `dependencies {\n    ${dep}\n`);
    return c;
  });
  // Priority 0 beats expo-notifications' -1, so FCM delivers to this subclass.
  return withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.service = (app.service ?? []).filter((s) => s.$['android:name'] !== '.CallMessagingService');
    app.service.push({
      $: { 'android:name': '.CallMessagingService', 'android:exported': 'false' },
      'intent-filter': [{ action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }] }],
    });
    return c;
  });
};
