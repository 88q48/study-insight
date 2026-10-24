package com.awesomeproject

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** 极简偏好存储，供壁纸和透明度等本地设置使用。 */
class AppPreferencesModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppPreferences"

  private fun prefs() =
    reactContext.getSharedPreferences("app_preferences", Context.MODE_PRIVATE)

  @ReactMethod
  fun getString(key: String, fallback: String, promise: Promise) {
    promise.resolve(prefs().getString(key, fallback) ?: fallback)
  }

  @ReactMethod
  fun setString(key: String, value: String, promise: Promise) {
    prefs().edit().putString(key, value).apply()
    promise.resolve(true)
  }

  @ReactMethod
  fun getFloat(key: String, fallback: Double, promise: Promise) {
    promise.resolve(prefs().getFloat(key, fallback.toFloat()).toDouble())
  }

  @ReactMethod
  fun setFloat(key: String, value: Double, promise: Promise) {
    prefs().edit().putFloat(key, value.toFloat()).apply()
    promise.resolve(true)
  }
}
