import { uploadUsageEvents } from '../api/client';
import type { UsageEventUpload } from '../api/types';
import { DEVICE_ID } from '../config';
import {
  getUsageSyncCursor,
  hasUsageAccess,
  isUsageStatsSupported,
  queryUsageSessions,
  setUsageSyncCursor,
} from '../native/usageStats';
import type { UsageSession } from '../native/usageStats';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type UsageSyncStatus =
  | 'unsupported'
  | 'permission_denied'
  | 'no_data'
  | 'uploaded'
  | 'failed';

export interface UsageSyncResult {
  status: UsageSyncStatus;
  uploaded?: number;
  reason?: string;
}

type AppInfo = {
  appKey: string;
  appName: string;
  category: string;
};

/**
 * Android 包名到后端 app_key 的映射。
 * 已知应用由后端统一展示名和分类；未知应用保留包名和系统应用名。
 */
const KNOWN_APPS: Record<string, AppInfo> = {
  'com.android.chrome': {appKey: 'chrome', appName: 'Chrome', category: '工具'},
  'com.tencent.mm': {appKey: 'com.tencent.mm', appName: '微信', category: '社交'},
  'com.ss.android.ugc.aweme': {appKey: 'douyin', appName: '抖音', category: '娱乐'},
  'com.chaoxing.mobile': {appKey: 'study', appName: '学习通', category: '学习'},
  'tv.danmaku.bili': {appKey: 'bilibili', appName: 'B站', category: '娱乐'},
};

function resolveApp(session: UsageSession): AppInfo {
  return (
    KNOWN_APPS[session.packageName] ?? {
      appKey: session.packageName,
      appName: session.appName || session.packageName,
      category: '其他',
    }
  );
}

function toUploadEvent(session: UsageSession): UsageEventUpload | null {
  if (
    !Number.isFinite(session.startMs) ||
    !Number.isFinite(session.endMs) ||
    session.endMs <= session.startMs
  ) {
    return null;
  }

  const app = resolveApp(session);
  const durationSeconds = Math.max(
    1,
    Math.round((session.endMs - session.startMs) / 1000),
  );

  return {
    // 用会话起止时间生成稳定 id；同一会话重复上传时后端只保留一条。
    event_id: `android_${DEVICE_ID}_${session.packageName}_${Math.round(
      session.startMs,
    )}_${Math.round(session.endMs)}`,
    device_id: DEVICE_ID,
    platform: 'android',
    app_key: app.appKey,
    app_name: app.appName,
    category: app.category,
    start_at: new Date(session.startMs).toISOString(),
    end_at: new Date(session.endMs).toISOString(),
    duration_seconds: durationSeconds,
  };
}

/**
 * 静默同步 Android 使用记录：
 * - 没权限时返回 permission_denied，不弹系统设置
 * - 只上传上次游标之后、已经结束的前台会话
 * - 上传成功后才推进游标，失败下次会重试
 */
export async function syncUsageStats(): Promise<UsageSyncResult> {
  if (!isUsageStatsSupported) {
    return {status: 'unsupported'};
  }

  if (!(await hasUsageAccess())) {
    return {status: 'permission_denied'};
  }

  try {
    const now = Date.now();
    const savedCursor = await getUsageSyncCursor();
    const cursor = Math.min(Math.max(savedCursor, 0), now);
    const start = Math.max(cursor || now - WINDOW_MS, now - WINDOW_MS);
    const sessions = await queryUsageSessions(start, now);
    const events = sessions
      .map(toUploadEvent)
      .filter((event): event is UsageEventUpload => event !== null);

    if (!events.length) {
      return {status: 'no_data'};
    }

    const result = await uploadUsageEvents(events);
    const lastEnd = Math.max(...events.map(event => Date.parse(event.end_at)));
    if (Number.isFinite(lastEnd)) {
      await setUsageSyncCursor(lastEnd);
    }

    return {
      status: 'uploaded',
      uploaded: result.inserted,
    };
  } catch (error) {
    const code = (error as {code?: string} | null)?.code;
    if (code === 'PERMISSION_DENIED') {
      return {status: 'permission_denied'};
    }
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : '使用记录同步失败',
    };
  }
}
