import { NativeModules, Platform } from 'react-native';

interface PreferencesNativeModule {
  getString(key: string, fallback: string): Promise<string>;
  setString(key: string, value: string): Promise<boolean>;
  getFloat(key: string, fallback: number): Promise<number>;
  setFloat(key: string, value: number): Promise<boolean>;
}

const nativePreferences: PreferencesNativeModule | undefined =
  Platform.OS === 'android'
    ? (NativeModules.AppPreferences as PreferencesNativeModule | undefined)
    : undefined;

export async function readPreference(
  key: string,
  fallback: string,
): Promise<string> {
  if (!nativePreferences) {
    return fallback;
  }
  try {
    const value = await nativePreferences.getString(key, fallback);
    return typeof value === 'string' ? value : fallback;
  } catch {
    return fallback;
  }
}

export async function writePreference(
  key: string,
  value: string,
): Promise<void> {
  if (!nativePreferences) {
    return;
  }
  try {
    await nativePreferences.setString(key, value);
  } catch {
    // 本地设置写入失败时保持当前会话状态，下次再试。
  }
}

export async function readNumberPreference(
  key: string,
  fallback: number,
): Promise<number> {
  if (!nativePreferences) {
    return fallback;
  }
  try {
    const value = Number(await nativePreferences.getFloat(key, fallback));
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export async function writeNumberPreference(
  key: string,
  value: number,
): Promise<void> {
  if (!nativePreferences) {
    return;
  }
  try {
    await nativePreferences.setFloat(key, value);
  } catch {
    // 本地设置写入失败时保持当前会话状态，下次再试。
  }
}
