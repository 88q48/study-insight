import { NativeModules, Platform, Vibration } from 'react-native';

interface FeedbackSoundModule {
  playSuccess: () => void;
  playError: () => void;
}

const FeedbackSound = NativeModules.FeedbackSound as
  | FeedbackSoundModule
  | undefined;

/**
 * 答题反馈音效。Android 使用原生 ToneGenerator；如果设备没有音频模块，
 * 用轻量振动兜底，保证答题流程不中断。
 */
export function playFeedbackSound(kind: 'success' | 'error') {
  if (Platform.OS === 'android' && FeedbackSound) {
    if (kind === 'success') {
      FeedbackSound.playSuccess();
    } else {
      FeedbackSound.playError();
    }
    return;
  }

  if (Platform.OS === 'ios') {
    Vibration.vibrate();
  }
}
