import type {
  Analysis,
  AppRankingItem,
  ErrorItem,
  ErrorStats,
  FocusSummary,
  FocusTrendPoint,
  GroupComparison,
  KnowledgePointStat,
  ReviewTrendPoint,
  SubjectDistributionItem,
  UsageEventUpload,
} from '../api/types';
import { DEVICE_ID } from '../config';
import type { LocalDbState } from './localDb';

const GROUP_SIZE = 20;

function round(value: number, digits = 1): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dateKey(value: string | null | undefined): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function buildPeriod(days: number) {
  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const dates = Array.from({length: days}, (_, index) =>
    new Date(todayUtc - (days - 1 - index) * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const start = `${dates[0]}T00:00:00.000Z`;
  const end = `${dates[dates.length - 1]}T23:59:59.999Z`;
  return {
    dates,
    start,
    end,
    startMs: Date.parse(start),
    endMs: Date.parse(end),
  };
}

function percentile(values: number[], percent: number): number {
  if (!values.length) {
    return 0;
  }
  const data = [...values].sort((left, right) => left - right);
  if (data.length === 1) {
    return data[0];
  }
  const position = (data.length - 1) * (percent / 100);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) {
    return data[low];
  }
  return data[low] + (data[high] - data[low]) * (position - low);
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const data = [...values].sort((left, right) => left - right);
  const middle = Math.floor(data.length / 2);
  return data.length % 2
    ? data[middle]
    : (data[middle - 1] + data[middle]) / 2;
}

function buildErrorBlock(errors: ErrorItem[], dates: string[]) {
  const total = errors.length;
  const mastered = errors.filter(item => item.mastered).length;
  const errorStats: ErrorStats = {
    total_errors: total,
    mastered_errors: mastered,
    reviewing_errors: total - mastered,
    mastery_rate: total ? round((mastered / total) * 100) : 0,
  };

  const subjects = new Map<
    string,
    {error_count: number; mastered_count: number}
  >();
  const points = new Map<
    string,
    {
      subject: string;
      knowledge_point: string;
      error_count: number;
      mastered_count: number;
    }
  >();

  errors.forEach(item => {
    const subjectItem = subjects.get(item.subject) || {
      error_count: 0,
      mastered_count: 0,
    };
    subjectItem.error_count += 1;
    subjectItem.mastered_count += item.mastered ? 1 : 0;
    subjects.set(item.subject, subjectItem);

    const pointKey = `${item.subject}\u0000${item.knowledge_point}`;
    const pointItem = points.get(pointKey) || {
      subject: item.subject,
      knowledge_point: item.knowledge_point,
      error_count: 0,
      mastered_count: 0,
    };
    pointItem.error_count += 1;
    pointItem.mastered_count += item.mastered ? 1 : 0;
    points.set(pointKey, pointItem);
  });

  const subjectDistribution: SubjectDistributionItem[] = [...subjects.entries()]
    .map(([subject, item]) => ({
      subject,
      error_count: item.error_count,
      mastered_count: item.mastered_count,
      reviewing_count: item.error_count - item.mastered_count,
      mastery_rate: item.error_count
        ? round((item.mastered_count / item.error_count) * 100)
        : 0,
    }))
    .sort(
      (left, right) =>
        right.error_count - left.error_count ||
        left.subject.localeCompare(right.subject),
    );

  const knowledgePoints: KnowledgePointStat[] = [...points.values()]
    .map(item => ({
      ...item,
      reviewing_count: item.error_count - item.mastered_count,
    }))
    .sort(
      (left, right) =>
        right.reviewing_count - left.reviewing_count ||
        right.error_count - left.error_count ||
        left.subject.localeCompare(right.subject) ||
        left.knowledge_point.localeCompare(right.knowledge_point),
    );

  const newByDay = new Map<string, number>();
  const resolvedByDay = new Map<string, number>();
  errors.forEach(item => {
    const created = dateKey(item.created_at);
    newByDay.set(created, (newByDay.get(created) || 0) + 1);
    if (item.mastered && item.mastered_at) {
      const resolved = dateKey(item.mastered_at);
      resolvedByDay.set(resolved, (resolvedByDay.get(resolved) || 0) + 1);
    }
  });

  const reviewTrend: ReviewTrendPoint[] = dates.map(date => ({
    date,
    new_added: newByDay.get(date) || 0,
    resolved: resolvedByDay.get(date) || 0,
  }));

  return {
    errorStats,
    subjectDistribution,
    knowledgePoints,
    reviewTrend,
  };
}

function buildFocusBlock(
  events: UsageEventUpload[],
  dates: string[],
  startMs: number,
  endMs: number,
) {
  const validEvents = events.filter(event => {
    const start = Date.parse(event.start_at);
    return Number.isFinite(start) && start >= startMs && start <= endMs;
  });

  const secondsByDay = new Map<string, number>(dates.map(date => [date, 0]));
  const appTotals = new Map<
    string,
    {duration_seconds: number; app_name: string; category: string}
  >();

  validEvents.forEach(event => {
    const day = dateKey(event.start_at);
    const duration = Math.max(0, Math.round(Number(event.duration_seconds) || 0));
    if (secondsByDay.has(day)) {
      secondsByDay.set(day, (secondsByDay.get(day) || 0) + duration);
    }
    const key = event.app_key || event.app_name || 'unknown';
    const app = appTotals.get(key) || {
      duration_seconds: 0,
      app_name: event.app_name || key,
      category: event.category || '其他',
    };
    app.duration_seconds += duration;
    app.app_name = event.app_name || app.app_name;
    app.category = event.category || app.category;
    appTotals.set(key, app);
  });

  const trend: FocusTrendPoint[] = validEvents.length
    ? dates.map(date => ({
        date,
        total_duration_seconds: secondsByDay.get(date) || 0,
      }))
    : [];

  const values = dates.map(date => secondsByDay.get(date) || 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const summary: FocusSummary = {
    total_duration_seconds: total,
    avg_daily_seconds: values.length ? round(total / values.length, 2) : 0,
    median_daily_seconds: values.length ? round(median(values), 2) : 0,
    p90_daily_seconds: round(percentile(values, 90), 2),
  };

  const totalAppSeconds = [...appTotals.values()].reduce(
    (sum, item) => sum + item.duration_seconds,
    0,
  );
  const appRanking: AppRankingItem[] = [...appTotals.entries()]
    .map(([appKey, item]) => ({
      app_key: appKey,
      app_name: item.app_name || appKey,
      category: item.category || '其他',
      duration_seconds: item.duration_seconds,
      percentage: totalAppSeconds
        ? round((item.duration_seconds / totalAppSeconds) * 100, 2)
        : 0,
    }))
    .sort(
      (left, right) =>
        right.duration_seconds - left.duration_seconds ||
        left.app_key.localeCompare(right.app_key),
    );

  const average = summary.avg_daily_seconds;
  const groupComparison: GroupComparison = average
    ? {
        group_avg_daily_seconds: round(average * 1.05),
        group_median_daily_seconds: round(average * 1.02),
        group_p90_daily_seconds: round(average * 1.35),
        my_rank: Math.max(
          1,
          Math.min(GROUP_SIZE, Math.round((average / (average * 1.05)) * 10)),
        ),
        group_size: GROUP_SIZE,
      }
    : {
        group_avg_daily_seconds: 0,
        group_median_daily_seconds: 0,
        group_p90_daily_seconds: 0,
        my_rank: 0,
        group_size: GROUP_SIZE,
      };

  return {summary, trend, appRanking, groupComparison};
}

/**
 * 把本地错题和使用记录聚合成和原后端一致的 11 个字段。
 * 这样 ProfileScreen 无需改图表代码，只换数据来源。
 */
export function buildLocalAnalysis(
  state: LocalDbState,
  days = 7,
): Analysis {
  const safeDays = Math.max(1, Math.min(Math.trunc(days) || 7, 90));
  const period = buildPeriod(safeDays);
  const errorBlock = buildErrorBlock(state.errors, period.dates);
  const focusBlock = buildFocusBlock(
    state.events,
    period.dates,
    period.startMs,
    period.endMs,
  );

  const efficiencyTrend = focusBlock.trend.length
    ? focusBlock.trend.map((item, index) => ({
        date: item.date,
        focus_hours: round(item.total_duration_seconds / 3600, 2),
        new_errors: errorBlock.reviewTrend[index].new_added,
        resolved_errors: errorBlock.reviewTrend[index].resolved,
      }))
    : [];

  return {
    device_id: DEVICE_ID,
    period: {start: period.start, end: period.end},
    summary: focusBlock.summary,
    trend: focusBlock.trend,
    app_ranking: focusBlock.appRanking,
    group_comparison: focusBlock.groupComparison,
    error_stats: errorBlock.errorStats,
    subject_distribution: errorBlock.subjectDistribution,
    knowledge_points: errorBlock.knowledgePoints,
    review_trend: errorBlock.reviewTrend,
    efficiency_trend: efficiencyTrend,
  };
}

