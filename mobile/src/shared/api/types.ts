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

export interface Analysis {
  device_id: string;
  error_stats: ErrorStats;
  knowledge_points: Array<{
    subject: string;
    knowledge_point: string;
    error_count: number;
    mastered_count: number;
    reviewing_count: number;
  }>;
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
