import { ANALYSIS_DAYS, API_BASE_URL, DEVICE_ID } from '../config';
import { handleOffline } from './offline';
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

  const method = options.method || 'GET';

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
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
      const httpError = new Error(String(detail));
      // 服务器答话了，就是它说不行。这种错误不能拿本地假数据顶替。
      (httpError as any).__answeredByServer = true;
      throw httpError;
    }
    return body as T;
  } catch (error) {
    if (error instanceof Error && (error as any).__answeredByServer) {
      throw error;
    }

    // 走不到服务器：可能是没连电脑，也可能只是断网。
    // 内置快照能应付就先用着，界面不该因为少了个后端就空白一片。
    const fallback = handleOffline(path, method, options.body);
    if (fallback !== null) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('[api] 后端没响应，已切到本地演示数据', path);
      } else {
        console.warn('[api] 连不上后端，已切到本地演示数据', path);
      }
      return fallback as T;
    }

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

/** 云端 OCR 切出来的一道题。 */
export interface OcrQuestion {
  /** 在本次返回里的顺序，从 1 开始 */
  index: number;
  /** 卷面上的题号。一页只拍第 7 题起，这里就是 7 */
  number?: number;
  subject: string;
  question_type: string;
  question_content: string;
  answer: string;
  options?: Record<string, string>;
  knowledge_point?: string;
  parser: 'llm' | 'local' | string;
}

/**
 * 云端 OCR 返回结构（后端 /api/v1/ocr/parse）。
 *
 * 一张卷子拍进去会切出多道题，看 questions；顶层那几个字段是第一题的副本，
 * 兼容只认单个题目的老调用方。
 */
export interface OcrParseResult {
  raw_text: string;
  subject: string;
  question_type: string;
  question_content: string;
  answer: string;
  parser: 'llm' | 'local' | string;
  /** 切出来的所有题，按卷面顺序 */
  questions?: OcrQuestion[];
  question_count?: number;
  /** 卷头（如「数学高三第一次模拟考」），用来猜科目 */
  header?: string;
}

export async function parseOcrImage(imageUri: string): Promise<OcrParseResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  const form = new FormData();
  form.append('file', {
    uri: imageUri,
    name: 'question.jpg',
    type: 'image/jpeg',
  } as any);

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/ocr/parse`, {
      method: 'POST',
      body: form,
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
        (body && (body.detail || body.message)) ||
        text ||
        `HTTP ${response.status}`;
      throw new Error(String(detail));
    }
    return body as OcrParseResult;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OCR 请求超时，请检查后端服务和网络');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
