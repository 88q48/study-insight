import { ANALYSIS_DAYS, API_BASE_URL, DEVICE_ID } from '../config';
import type {
  Analysis,
  ErrorItem,
  NewErrorPayload,
  SubjectOption,
  UsageEventUpload,
} from './types';

interface RequestOptions {
  method?: string;
  body?: string;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers: {'Content-Type': 'application/json'},
      body: options.body,
      signal: controller.signal,
    });

    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!response.ok) {
      const detail =
        (body && (body.detail || body.message)) || text || `HTTP ${response.status}`;
      throw new Error(String(detail));
    }
    return body as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时，请确认后端服务已启动');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function fetchErrors(limit = 50): Promise<{total: number; items: ErrorItem[]}> {
  return request(
    `/api/v1/errors?device_id=${encodeURIComponent(DEVICE_ID)}&limit=${limit}`,
  );
}

export function createError(payload: NewErrorPayload) {
  return request<{status: string; error_id: string; message: string}>(
    '/api/v1/errors',
    {
      method: 'POST',
      body: JSON.stringify({device_id: DEVICE_ID, ...payload}),
    },
  );
}

export function markMastered(errorId: string, reviewCount = 1) {
  return request<{status: string; error: ErrorItem}>(
    `/api/v1/errors/${encodeURIComponent(errorId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({mastered: true, review_count: reviewCount}),
    },
  );
}

export function fetchAnalysis(days = ANALYSIS_DAYS): Promise<Analysis> {
  return request(
    `/api/v1/devices/${encodeURIComponent(DEVICE_ID)}/analysis?days=${days}`,
  );
}

export function fetchSubjects(): Promise<{
  total: number;
  subjects: SubjectOption[];
}> {
  return request(
    `/api/v1/errors/subjects?device_id=${encodeURIComponent(DEVICE_ID)}`,
  );
}

export function fetchPracticeErrors(subject?: string, limit = 10) {
  const subjectQuery = subject
    ? `&subject=${encodeURIComponent(subject)}`
    : '';
  return request<{total: number; subject: string | null; items: ErrorItem[]}>(
    `/api/v1/errors/practice?device_id=${encodeURIComponent(
      DEVICE_ID,
    )}&limit=${limit}${subjectQuery}`,
  );
}

export function recordAttempt(errorId: string, answer: string) {
  return request<{status: string; correct: boolean; error: ErrorItem}>(
    `/api/v1/errors/${encodeURIComponent(errorId)}/attempts`,
    {
      method: 'POST',
      body: JSON.stringify({device_id: DEVICE_ID, answer}),
    },
  );
}

export function deleteError(errorId: string) {
  return request<{status: string; deleted: boolean; error_id: string}>(
    `/api/v1/errors/${encodeURIComponent(errorId)}?device_id=${encodeURIComponent(
      DEVICE_ID,
    )}`,
    {method: 'DELETE'},
  );
}

/** 批量上传 Android UsageStats 采集到的应用使用记录。 */
export function uploadUsageEvents(events: UsageEventUpload[]) {
  return request<{status: string; inserted: number; duplicates: number}>(
    '/api/v1/events/batch',
    {
      method: 'POST',
      body: JSON.stringify({events}),
    },
  );
}
