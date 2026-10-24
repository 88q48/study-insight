import type { ErrorItem, UsageEventUpload } from '../api/types';
import { readPreference, writePreference } from '../storage/preferences';

/**
 * 手机端本地数据库。
 *
 * 之前错题、练习记录和使用时长都放在电脑上的 FastAPI 后端里，
 * 导致 APK 离开电脑就只剩空页面。这里把同一份数据落到 Android
 * SharedPreferences（通过已有的 AppPreferences 原生模块），
 * 让 APK 自己就能完成录入、练习、删除和学情统计。
 *
 * 数据量很小（几百道题 + 最近几天的应用使用记录），整份 JSON 存在
 * 一个字符串里足够；后续如果记录量明显变大，再换成 SQLite。
 */

const STORAGE_KEY = 'local_db_v1';
const MAX_USAGE_EVENTS = 5000;
const USAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface LocalDbState {
  version: 1;
  errors: ErrorItem[];
  events: UsageEventUpload[];
}

let cache: LocalDbState | null = null;
let loading: Promise<LocalDbState> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function emptyState(): LocalDbState {
  return {version: 1, errors: [], events: []};
}

function cloneError(item: ErrorItem): ErrorItem {
  return {...item};
}

function cloneEvent(item: UsageEventUpload): UsageEventUpload {
  return {...item};
}

function normalizeState(raw: unknown): LocalDbState {
  if (!raw || typeof raw !== 'object') {
    return emptyState();
  }
  const value = raw as Partial<LocalDbState>;
  const errors = Array.isArray(value.errors)
    ? value.errors.filter(
        (item): item is ErrorItem =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as ErrorItem).error_id === 'string' &&
          typeof (item as ErrorItem).content === 'string',
      )
    : [];
  const events = Array.isArray(value.events)
    ? value.events.filter(
        (item): item is UsageEventUpload =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as UsageEventUpload).event_id === 'string' &&
          typeof (item as UsageEventUpload).start_at === 'string',
      )
    : [];
  return {version: 1, errors, events};
}

async function loadState(): Promise<LocalDbState> {
  if (cache) {
    return cache;
  }
  if (!loading) {
    loading = (async () => {
      const raw = await readPreference(STORAGE_KEY, '');
      if (!raw) {
        cache = emptyState();
        return cache;
      }
      try {
        cache = normalizeState(JSON.parse(raw));
      } catch {
        cache = emptyState();
      }
      return cache;
    })();
  }
  return loading;
}

/** 读取一份可安全修改的快照，调用方不会改到缓存里的对象。 */
export async function readLocalState(): Promise<LocalDbState> {
  await writeQueue;
  const state = await loadState();
  return {
    version: 1,
    errors: state.errors.map(cloneError),
    events: state.events.map(cloneEvent),
  };
}

/**
 * 串行修改本地库，避免两个页面同时写入时后一次覆盖前一次。
 * mutator 必须是同步函数；异步操作请在调用前完成。
 */
export function updateLocalState<T>(
  mutator: (state: LocalDbState) => T,
): Promise<T> {
  const task = writeQueue.then(async () => {
    const state = await loadState();
    const result = mutator(state);
    await writePreference(STORAGE_KEY, JSON.stringify(state));
    return result;
  });
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

/** 只保留最近 30 天、最多 5000 条应用使用记录，防止偏好文件无限增长。 */
export function trimUsageEvents(events: UsageEventUpload[]): UsageEventUpload[] {
  const cutoff = Date.now() - USAGE_RETENTION_MS;
  return events
    .filter(event => {
      const start = Date.parse(event.start_at);
      return Number.isFinite(start) && start >= cutoff;
    })
    .sort((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at))
    .slice(-MAX_USAGE_EVENTS);
}
