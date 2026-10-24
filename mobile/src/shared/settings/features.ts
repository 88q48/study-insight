/**
 * 功能开关清单。
 *
 * 这里列出来的每一项都会自动出现在「设置 → 功能」里，加新功能只需要
 * 往 FEATURES 追加一个对象，再把 FeatureId 联合类型补上对应分支，
 * 存储和界面都不用另外改。
 *
 * 为什么要有这份清单：功能不是写完就该一直显示。有些要系统权限
 * （比如专注效率要「使用情况访问」），有些要联网，有些只是试验阶段。
 * 写死在源码里的常量用户改不了，做成清单就都能自己决定。
 */

/** 可开关的功能。加功能时在这里补一个 id。 */
export type FeatureId = 'focus';

export interface FeatureFlag {
  id: FeatureId;
  /** 设置页里的标题 */
  label: string;
  /** 副标题，说清楚这功能干什么、依赖什么 */
  hint: string;
  /** 第一次打开 App 时的默认状态 */
  defaultOn: boolean;
  /** 是否依赖 Android 系统权限（关着的时候不提示权限，开着才提示） */
  requiresPermission?: boolean;
  /** 依赖的那个权限在设置里的名字，用于提示文案 */
  permissionLabel?: string;
}

export const FEATURES: readonly FeatureFlag[] = [
  {
    id: 'focus',
    label: '专注效率',
    hint: '按应用使用时长统计学习专注度，只读取应用名和时长，数据留在本机。',
    defaultOn: true,
    requiresPermission: true,
    permissionLabel: '使用情况访问',
  },
];

/** 清单里所有 id，方便遍历和校验。 */
export const FEATURE_IDS: readonly FeatureId[] = FEATURES.map(item => item.id);

/** 按 id 取一项配置，取不到返回 undefined。 */
export function findFeature(id: FeatureId): FeatureFlag | undefined {
  return FEATURES.find(item => item.id === id);
}

/** 默认状态表：清单里每一项的 defaultOn。 */
export function defaultFlags(): Record<FeatureId, boolean> {
  const out = {} as Record<FeatureId, boolean>;
  for (const item of FEATURES) {
    out[item.id] = item.defaultOn;
  }
  return out;
}
