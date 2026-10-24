import type {
  Analysis,
  ErrorItem,
  NewErrorPayload,
  SubjectOption,
  UsageEventUpload,
} from '../api/types';
import { DEVICE_ID } from '../config';
import { buildLocalAnalysis } from './localAnalytics';
import {
  readLocalState,
  trimUsageEvents,
  updateLocalState,
} from './localDb';
import { parseOcrText, recognizeWithBaidu } from './ocr';
import type { OcrParseResult } from './ocr';

export type { OcrParseResult, OcrQuestion } from './ocr';
export { parseOcrText, toOcrQuestions } from './ocr';

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeAnswer(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, '').toLowerCase();
}

function serializeError(item: ErrorItem): ErrorItem {
  const attemptCount = Number(item.attempt_count) || 0;
  const correctCount = Number(item.correct_count) || 0;
  return {
    ...item,
    question_content: item.content,
    attempt_count: attemptCount,
    correct_count: correctCount,
    wrong_count: Math.max(attemptCount - correctCount, 0),
    accuracy: attemptCount
      ? Math.round((correctCount / attemptCount) * 1000) / 10
      : 0,
  };
}

function errorKey(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase();
}

function sortErrors(items: ErrorItem[]): ErrorItem[] {
  return [...items].sort((left, right) => {
    const leftCreated = Date.parse(left.created_at) || 0;
    const rightCreated = Date.parse(right.created_at) || 0;
    return (
      rightCreated - leftCreated ||
      right.error_id.localeCompare(left.error_id)
    );
  });
}

/** 本地保存一道错题，接口形状与原后端保持一致。 */
export async function createError(payload: NewErrorPayload) {
  return updateLocalState(state => {
    const errorId = payload.error_id?.trim() || `err_${Date.now()}`;
    if (state.errors.some(item => item.error_id === errorId)) {
      return {
        status: 'success',
        duplicate: true,
        error_id: errorId,
        message: '这道题已经在本机错题本里了',
      };
    }

    const subject = (payload.subject || '').trim();
    if (!subject) {
      throw new Error('科目不能为空');
    }
    const content = (payload.content || payload.question_content || '').trim();
    if (!content) {
      throw new Error('题目内容不能为空');
    }

    const createdAt = payload.created_at || nowIso();
    const mastered = Boolean(payload.mastered);
    const next: ErrorItem = {
      error_id: errorId,
      device_id: DEVICE_ID,
      subject,
      knowledge_point: (payload.knowledge_point || '').trim() || '未分类',
      content,
      question_content: content,
      answer: (payload.answer || '').trim(),
      question_type: payload.question_type || 'fill',
      option_a: payload.option_a || '',
      option_b: payload.option_b || '',
      option_c: payload.option_c || '',
      option_d: payload.option_d || '',
      attempt_count: 0,
      correct_count: 0,
      wrong_count: 0,
      accuracy: 0,
      created_at: createdAt,
      mastered,
      review_count: Math.max(0, Number(payload.review_count) || 0),
      mastered_at: mastered ? createdAt : null,
    };
    state.errors.push(next);
    return {
      status: 'success',
      duplicate: false,
      error_id: errorId,
      message: '错题已保存到本机',
    };
  });
}

export async function fetchErrors(
  limit = 50,
): Promise<{total: number; items: ErrorItem[]}> {
  const state = await readLocalState();
  const items = sortErrors(state.errors)
    .slice(0, Math.max(1, Math.min(limit, 500)))
    .map(serializeError);
  return {total: items.length, items};
}

export async function fetchSubjects(): Promise<{
  total: number;
  subjects: SubjectOption[];
}> {
  const state = await readLocalState();
  const counts = new Map<string, number>();
  state.errors.forEach(item => {
    counts.set(item.subject, (counts.get(item.subject) || 0) + 1);
  });
  const subjects = [...counts.entries()]
    .map(([subject, count]) => ({subject, count}))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.subject.localeCompare(right.subject),
    );
  return {total: subjects.length, subjects};
}

/**
 * 练习队列：先按“错得最多”排，再按做题次数和录入时间排。
 * 与后端 practice_errors 的口径一致，并在客户端按题干去重。
 */
export async function fetchPracticeErrors(subject?: string, limit = 10) {
  const state = await readLocalState();
  const filtered = subject
    ? state.errors.filter(item => item.subject === subject)
    : state.errors;

  const bestByContent = new Map<string, ErrorItem>();
  filtered.forEach(item => {
    const key = errorKey(item.content || item.question_content || '') ||
      `id:${item.error_id}`;
    const existing = bestByContent.get(key);
    if (!existing) {
      bestByContent.set(key, item);
      return;
    }
    const itemWrong = (item.attempt_count || 0) - (item.correct_count || 0);
    const existingWrong =
      (existing.attempt_count || 0) - (existing.correct_count || 0);
    if (itemWrong > existingWrong) {
      bestByContent.set(key, item);
    }
  });

  const items = [...bestByContent.values()]
    .sort((left, right) => {
      const leftWrong = (left.attempt_count || 0) - (left.correct_count || 0);
      const rightWrong = (right.attempt_count || 0) - (right.correct_count || 0);
      return (
        rightWrong - leftWrong ||
        (right.attempt_count || 0) - (left.attempt_count || 0) ||
        (Date.parse(right.created_at) || 0) - (Date.parse(left.created_at) || 0) ||
        right.error_id.localeCompare(left.error_id)
      );
    })
    .slice(0, Math.max(1, Math.min(limit, 200)))
    .map(serializeError);

  return {total: items.length, subject: subject || null, items};
}

export interface AttemptResult {
  status: string;
  correct: boolean;
  reason?: string;
  error: ErrorItem;
}

/** 记录一次作答；错题会自动退回待复习，答对不会自动标记已掌握。 */
export async function recordAttempt(
  errorId: string,
  answer: string,
): Promise<AttemptResult> {
  return updateLocalState(state => {
    const index = state.errors.findIndex(item => item.error_id === errorId);
    if (index < 0) {
      throw new Error('错题不存在');
    }
    const current = state.errors[index];
    if (!(current.answer || '').trim()) {
      return {
        status: 'skipped',
        correct: false,
        reason: '这道题没有录入答案，无法判对错，本次作答未计入统计',
        error: serializeError(current),
      };
    }

    const correct =
      normalizeAnswer(answer) === normalizeAnswer(current.answer);
    const next: ErrorItem = {
      ...current,
      attempt_count: (current.attempt_count || 0) + 1,
      correct_count: (current.correct_count || 0) + (correct ? 1 : 0),
      mastered: correct ? current.mastered : false,
      mastered_at: correct ? current.mastered_at ?? null : null,
    };
    state.errors[index] = next;
    return {
      status: 'success',
      correct,
      error: serializeError(next),
    };
  });
}

/** 用户手动标记已掌握。 */
export async function markMastered(
  errorId: string,
  reviewCount = 1,
): Promise<{status: string; error: ErrorItem}> {
  return updateLocalState(state => {
    const index = state.errors.findIndex(item => item.error_id === errorId);
    if (index < 0) {
      throw new Error('错题不存在');
    }
    const current = state.errors[index];
    const next: ErrorItem = {
      ...current,
      mastered: true,
      review_count: Math.max(
        Number(current.review_count) || 0,
        Number(reviewCount) || 1,
      ),
      mastered_at: current.mastered_at || nowIso(),
    };
    state.errors[index] = next;
    return {status: 'success', error: serializeError(next)};
  });
}

export async function deleteError(errorId: string) {
  return updateLocalState(state => {
    const index = state.errors.findIndex(item => item.error_id === errorId);
    if (index < 0) {
      throw new Error('错题不存在');
    }
    state.errors.splice(index, 1);
    return {status: 'success', deleted: true, error_id: errorId};
  });
}

export function fetchAnalysis(days = 7): Promise<Analysis> {
  return readLocalState().then(state => buildLocalAnalysis(state, days));
}

/**
 * UsageStats 同步不再上传到电脑，而是直接写入本地事件表。
 * 返回值保留 inserted/duplicates，ProfileScreen 无需感知存储变化。
 */
export async function uploadUsageEvents(events: UsageEventUpload[]) {
  return updateLocalState(state => {
    const existingIds = new Set(state.events.map(event => event.event_id));
    let inserted = 0;
    let duplicates = 0;
    events.forEach(event => {
      if (existingIds.has(event.event_id)) {
        duplicates += 1;
        return;
      }
      existingIds.add(event.event_id);
      state.events.push({...event, device_id: DEVICE_ID});
      inserted += 1;
    });
    state.events = trimUsageEvents(state.events);
    return {status: 'success', inserted, duplicates};
  });
}

/**
 * 手机直连百度 OCR。调用方传入 ImagePicker 的 base64，
 * 不再需要电脑上的 /api/v1/ocr/parse。
 */
export async function parseOcrImage(
  imageBase64: string,
): Promise<OcrParseResult> {
  const rawText = await recognizeWithBaidu(imageBase64);
  return parseOcrText(rawText);
}
