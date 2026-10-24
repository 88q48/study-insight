package com.awesomeproject

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import java.util.Calendar

/**
 * Android UsageStats 桥接：
 * - 检查 / 打开「使用情况访问」特殊权限
 * - 读取指定时间窗口内的前台应用会话
 * - 用 SharedPreferences 保存同步游标，避免重复读取
 *
 * 只返回已经结束的前台会话。当前仍在使用的会话会在下一次同步时再读取，
 * 这样不需要在客户端做复杂的去重和补写。
 */
class UsageStatsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val PREFS_NAME = "usage_sync"
    private const val KEY_LAST_SYNC = "last_sync_end_ms"
    private const val TYPE_FOREGROUND = 1
    private const val TYPE_BACKGROUND = 2
    private const val TYPE_STOPPED = 23
    private const val MIN_SESSION_MS = 5_000L
  }

  override fun getName(): String = "UsageStats"

  @ReactMethod
  fun hasPermission(promise: Promise) {
    promise.resolve(hasUsageAccess())
  }

  @ReactMethod
  fun openSettings(promise: Promise) {
    try {
      val packageUri = Uri.parse("package:${reactContext.packageName}")
      val appSpecific = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, packageUri)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        reactContext.startActivity(appSpecific)
      } catch (_: Exception) {
        val general = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(general)
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OPEN_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getLastSync(promise: Promise) {
    val prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    promise.resolve(prefs.getLong(KEY_LAST_SYNC, 0L).toDouble())
  }

  @ReactMethod
  fun setLastSync(value: Double, promise: Promise) {
    val prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit().putLong(KEY_LAST_SYNC, value.toLong()).apply()
    promise.resolve(true)
  }

  @ReactMethod
  fun getUsageSessions(startMs: Double, endMs: Double, promise: Promise) {
    if (!hasUsageAccess()) {
      promise.reject("PERMISSION_DENIED", "缺少使用情况访问权限")
      return
    }

    val start = startMs.toLong()
    val end = endMs.toLong()
    if (start <= 0L || end <= start) {
      promise.reject("INVALID_RANGE", "使用记录时间范围无效")
      return
    }

    try {
      val manager = reactContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val events = manager.queryEvents(start, end)
      val sessions = Arguments.createArray()
      val event = UsageEvents.Event()

      var currentPackage: String? = null
      var currentStart = 0L

      fun closeCurrent(at: Long) {
        val packageName = currentPackage ?: return
        if (at > currentStart) {
          addSplitSessions(packageName, currentStart, at, sessions)
        }
        currentPackage = null
        currentStart = 0L
      }

      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val packageName = event.packageName ?: continue
        val timestamp = event.timeStamp
        when (event.eventType) {
          TYPE_FOREGROUND -> {
            // 同一个应用内切换 Activity 会连续收到前后台事件，不要切断会话。
            if (packageName != currentPackage) {
              closeCurrent(timestamp)
              if (shouldTrack(packageName)) {
                currentPackage = packageName
                currentStart = timestamp
              }
            }
          }
          TYPE_BACKGROUND, TYPE_STOPPED -> {
            if (packageName == currentPackage) {
              closeCurrent(timestamp)
            }
          }
        }
      }

      // 不关闭 currentPackage：它可能仍在运行，留到下一次同步。
      promise.resolve(sessions)
    } catch (error: Exception) {
      promise.reject("USAGE_QUERY_FAILED", error.message, error)
    }
  }

  private fun hasUsageAccess(): Boolean {
    val appOps = reactContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        reactContext.packageName,
      )
    } else {
      appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        reactContext.packageName,
      )
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }


  private fun shouldTrack(packageName: String): Boolean {
    if (packageName == reactContext.packageName) {
      return false
    }
    if (packageName == "com.android.systemui") {
      return false
    }
    return try {
      reactContext.packageManager.getLaunchIntentForPackage(packageName) != null
    } catch (_: Exception) {
      false
    }
  }

  private fun addSplitSessions(
    packageName: String,
    start: Long,
    end: Long,
    output: WritableArray,
  ) {
    val appName = try {
      val info = reactContext.packageManager.getApplicationInfo(packageName, 0)
      reactContext.packageManager.getApplicationLabel(info).toString()
    } catch (_: Exception) {
      packageName
    }

    var cursor = start
    while (cursor < end) {
      val calendar = Calendar.getInstance()
      calendar.timeInMillis = cursor
      calendar.set(Calendar.HOUR_OF_DAY, 0)
      calendar.set(Calendar.MINUTE, 0)
      calendar.set(Calendar.SECOND, 0)
      calendar.set(Calendar.MILLISECOND, 0)
      calendar.add(Calendar.DAY_OF_MONTH, 1)
      val nextMidnight = calendar.timeInMillis
      if (nextMidnight <= cursor) {
        break
      }

      val segmentEnd = minOf(end, nextMidnight)
      val duration = segmentEnd - cursor
      if (duration >= MIN_SESSION_MS) {
        output.pushMap(
          Arguments.createMap().apply {
            putString("packageName", packageName)
            putString("appName", appName)
            putDouble("startMs", cursor.toDouble())
            putDouble("endMs", segmentEnd.toDouble())
            putInt("durationSeconds", (duration / 1000).toInt())
          },
        )
      }

      if (segmentEnd >= end) {
        break
      }
      cursor = segmentEnd
    }
  }

}
