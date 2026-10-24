package com.awesomeproject

import android.media.AudioManager
import android.media.ToneGenerator
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FeedbackSoundModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private val toneGenerator: ToneGenerator by lazy {
    ToneGenerator(AudioManager.STREAM_MUSIC, 80)
  }

  override fun getName(): String = "FeedbackSound"

  @ReactMethod
  fun playSuccess() {
    play(ToneGenerator.TONE_PROP_ACK, 220)
  }

  @ReactMethod
  fun playError() {
    play(ToneGenerator.TONE_PROP_NACK, 320)
  }

  private fun play(tone: Int, durationMs: Int) {
    try {
      toneGenerator.startTone(tone, durationMs)
    } catch (_: RuntimeException) {
      // Emulators or devices without an audio output should not break the quiz.
    }
  }

  override fun invalidate() {
    try {
      toneGenerator.release()
    } catch (_: RuntimeException) {
      // Ignore release failures during teardown.
    }
    super.invalidate()
  }
}
