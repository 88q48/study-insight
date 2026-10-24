import { NativeModules, Platform } from 'react-native';

export interface UsageSession {
  packageName: string;
  appName: string;
  startMs: number;
  endMs: number;
  durationSeconds: number;
}

interface UsageStatsNativeModule {
  hasPermission(): Promise<boolean>;
  openSettings(): Promise<boolean>;
  getLastSync(): Promise<number>;
  setLastSync(value: number): Promise<boolean>;
  getUsageSessions(startMs: number, endMs: number): Promise<UsageSession[]>;
}

const nativeUsageStats: UsageStatsNativeModule | undefined =
  Platform.OS === 'android'
    ? (NativeModules.UsageStats as UsageStatsNativeModule | undefined)
    : undefined;

export const isUsageStatsSupported = Boolean(nativeUsageStats);

export async function hasUsageAccess(): Promise<boolean> {
  if (!nativeUsageStats) {
    return false;
  }
  try {
    return Boolean(await nativeUsageStats.hasPermission());
  } catch {
    return false;
  }
}

export async function openUsageAccessSettings(): Promise<boolean> {
  if (!nativeUsageStats) {
    return false;
  }
  try {
    return Boolean(await nativeUsageStats.openSettings());
  } catch {
    return false;
  }
}

export async function getUsageSyncCursor(): Promise<number> {
  if (!nativeUsageStats) {
    return 0;
  }
  try {
    const value = Number(await nativeUsageStats.getLastSync());
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export async function setUsageSyncCursor(value: number): Promise<void> {
  if (!nativeUsageStats) {
    return;
  }
  try {
    await nativeUsageStats.setLastSync(value);
  } catch {
    // 下一次同步会重新读取游标；失败不会丢已经上传的数据。
  }
}

export async function queryUsageSessions(
  startMs: number,
  endMs: number,
): Promise<UsageSession[]> {
  if (!nativeUsageStats) {
    return [];
  }
  const result = await nativeUsageStats.getUsageSessions(startMs, endMs);
  if (!Array.isArray(result)) {
    return [];
  }
  return result
    .map(item => ({
      packageName: String(item.packageName || ''),
      appName: String(item.appName || item.packageName || '未知应用'),
      startMs: Number(item.startMs),
      endMs: Number(item.endMs),
      durationSeconds: Number(item.durationSeconds),
    }))
    .filter(item => item.packageName && item.startMs > 0 && item.endMs > item.startMs);
}
