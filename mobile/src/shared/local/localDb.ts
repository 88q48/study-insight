import type { ErrorItem, UsageEventUpload } from '../api/types';
import { readPreference, writePreference } from '../storage/preferences';
import seed from '../api/offlineSeed.json';

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

const STORAGE_KEY_PREFIX = 'local_db_v1';

/**
 * 每个账户一份独立的题库。
 *
 * 以前所有账户共用一个 key，谁最后登录谁的数据就覆盖上去。
 * 加上账户后缀之后，A 看不到 B 的错题，退出再进来还是自己那份。
 */
function storageKey(): string {
  // activeAccountId 为空说明还没登录（启动动画阶段），
  // 这时候用占位 key，反正不会被写进去。
  return `${STORAGE_KEY_PREFIX}_${activeAccountId || 'anon'}`;
}

/** 当前账户。由 setActiveAccount 设置，切账户时必须跟着换。 */
let activeAccountId = '';
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

/**
 * 第一次打开（本地还什么都没存）时铺进去的错题。
 *
 * 数据来自真实后端的一份快照，见 src/shared/api/offlineSeed.json。
 * 没有这份数据，新装完打开就是「0 道错题 / 掌握率 0%」，练习也抽不出题，
 * 演示和录屏都无从下手。重新导出：cd backend && python export_seed.py
 */
function seededErrors(): ErrorItem[] {
  const items = (seed as {errors?: {items?: unknown}}).errors?.items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter(
    (item): item is ErrorItem =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as ErrorItem).error_id === 'string' &&
      typeof (item as ErrorItem).content === 'string',
  ).map(cloneError);
}

function emptyState(): LocalDbState {
  // 新账户从空库开始。121 道演示数据现在只在示例账户里，
  // 走 seedDemoData() 显式灌入，不会跟着新注册用户出现。
  return {version: 1, errors: [], events: []};
}

/** 把演示数据灌进当前账户。只在示例账户上用。 */
export async function seedDemoData(): Promise<number> {
  const seeded = seededErrors();
  if (!seeded.length) {
    return 0;
  }
  await updateLocalState(state => {
    // 已经有数据就别再灌一遍，免得点两次变成 242 道
    if (state.errors.length > 0) {
      return;
    }
    state.errors = seeded;
  });
  return seeded.length;
}

/** 清空当前账户的所有错题，使用记录留着。 */
export async function clearAllErrors(): Promise<void> {
  await updateLocalState(state => {
    state.errors = [];
  });
}

/**
 * 切换当前账户。
 *
 * 清掉 cache 和 loading 是关键：这两个是模块级变量，不清干净的话
 * 切完账户读到的还是上一个人的数据——这类 bug 在演示时最难解释。
 */
export function setActiveAccount(accountId: string): void {
  if (activeAccountId === accountId) {
    return;
  }
  activeAccountId = accountId;
  cache = null;
  loading = null;
}

/** 当前是哪个账户的库，调试和「只读示例账户」判断用。 */
export function getActiveAccountId(): string {
  return activeAccountId;
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
      const raw = await readPreference(storageKey(), '');
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
    await writePreference(storageKey(), JSON.stringify(state));
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
