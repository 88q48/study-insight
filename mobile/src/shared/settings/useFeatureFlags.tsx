import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { readPreference, writePreference } from '../storage/preferences';
import { syncUsageStats } from '../usage/sync';
import { defaultFlags, FEATURES } from './features';
import type { FeatureId } from './features';

/**
 * 功能开关的全局状态。
 *
 * 写成 Context 是因为设置页改开关后，「我的」页要立刻跟着变。
 * 只读存储的话得等切页面重新加载，用户会觉得没生效。
 *
 * 存储格式：一个 key 存整个 JSON 对象。加新功能不用迁移老数据——
 * 读的时候按 FEATURES 清单逐项兜底，清单里没有的旧 key 直接忽略。
 */

const STORAGE_KEY = 'feature_flags_v1';

type Flags = Record<FeatureId, boolean>;

interface FeatureFlagsContextValue {
  flags: Flags;
  setFlag: (id: FeatureId, on: boolean) => void;
  /** 首次读取完成前为 true，避免界面先闪一下默认值 */
  loading: boolean;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

/**
 * 把存储里的 JSON 合并成完整的状态表。
 *
 * 只认 FEATURES 里声明过的 id：清单里有的用存的值（没有就用 defaultOn），
 * 清单外的统统丢掉。这样删掉一个功能、或者从旧版本升上来都不会出错。
 */
function mergeWithDefaults(raw: string): Flags {
  const base = defaultFlags();
  if (!raw) {
    return base;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!parsed || typeof parsed !== 'object') {
    return base;
  }
  const saved = parsed as Record<string, unknown>;
  for (const item of FEATURES) {
    const value = saved[item.id];
    if (typeof value === 'boolean') {
      base[item.id] = value;
    }
  }
  return base;
}

export function FeatureFlagsProvider({children}: {children: React.ReactNode}) {
  const [flags, setFlags] = useState<Flags>(() => defaultFlags());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    readPreference(STORAGE_KEY, '')
      .then(raw => {
        if (!mounted) {
          return;
        }
        const merged = mergeWithDefaults(raw);
        setFlags(merged);
        setLoading(false);
        // 专注开着才去读使用记录，关着就别在后台采集了
        if (merged.focus) {
          void syncUsageStats();
        }
      })
      .catch(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setFlag = useCallback((id: FeatureId, on: boolean) => {
    setFlags(current => {
      if (current[id] === on) {
        return current;
      }
      const next = {...current, [id]: on};
      void writePreference(STORAGE_KEY, JSON.stringify(next));
      // 刚打开专注时补一次同步，不然要等下次启动才有数据
      if (id === 'focus' && on) {
        void syncUsageStats();
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({flags, setFlag, loading}),
    [flags, setFlag, loading],
  );

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagsContextValue {
  const value = useContext(FeatureFlagsContext);
  if (!value) {
    throw new Error('useFeatureFlags 必须在 FeatureFlagsProvider 内使用');
  }
  return value;
}
