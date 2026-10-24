export type QuestionType = 'choice' | 'fill';

export interface ErrorItem {
  error_id: string;
  device_id: string;
  subject: string;
  knowledge_point: string;
  /** 题目内容 */
  content: string;
  /** 旧字段，后端会把它映射成 content */
  question_content?: string;
  /** 答案 / 解析；选择题存 A/B/C/D */
  answer: string;
  question_type?: QuestionType;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  attempt_count?: number;
  correct_count?: number;
  wrong_count?: number;
  accuracy?: number;
  created_at: string;
  mastered: boolean;
  review_count: number;
  mastered_at?: string | null;
}

export interface ErrorStats {
  total_errors: number;
  mastered_errors: number;
  reviewing_errors: number;
  mastery_rate: number;
}

export interface FocusSummary {
  total_duration_seconds: number;
  avg_daily_seconds: number;
  median_daily_seconds: number;
  p90_daily_seconds: number;
}

export interface FocusTrendPoint {
  date: string;
  total_duration_seconds: number;
}

export interface AppRankingItem {
  app_key: string;
  app_name: string;
  category: string;
  duration_seconds: number;
  percentage: number;
}

export interface GroupComparison {
  group_avg_daily_seconds: number;
  group_median_daily_seconds: number;
  group_p90_daily_seconds: number;
  my_rank: number;
  group_size: number;
}

export interface SubjectDistributionItem {
  subject: string;
  error_count: number;
  mastered_count: number;
  reviewing_count: number;
  mastery_rate: number;
}

export interface KnowledgePointStat {
  subject: string;
  knowledge_point: string;
  error_count: number;
  mastered_count: number;
  reviewing_count: number;
}

export interface ReviewTrendPoint {
  date: string;
  new_added: number;
  resolved: number;
}

export interface EfficiencyTrendPoint {
  date: string;
  focus_hours: number;
  new_errors: number;
  resolved_errors: number;
}

export interface Analysis {
  device_id: string;
  period: {start: string; end: string};
  summary: FocusSummary;
  trend: FocusTrendPoint[];
  app_ranking: AppRankingItem[];
  group_comparison: GroupComparison;
  error_stats: ErrorStats;
  subject_distribution: SubjectDistributionItem[];
  knowledge_points: KnowledgePointStat[];
  review_trend: ReviewTrendPoint[];
  efficiency_trend: EfficiencyTrendPoint[];
}

export interface NewErrorPayload {
  error_id: string;
  subject: string;
  knowledge_point: string;
  content: string;
  answer?: string;
  question_type?: QuestionType;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  question_content?: string;
  created_at: string;
  mastered?: boolean;
  review_count?: number;
}

export interface SubjectOption {
  subject: string;
  count: number;
}
