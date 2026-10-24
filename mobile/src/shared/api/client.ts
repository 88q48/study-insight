import { ANALYSIS_DAYS, API_BASE_URL, DEVICE_ID } from '../config';
import type { Analysis, ErrorItem, NewErrorPayload } from './types';

interface RequestOptions {
  method?: string;
  body?: string;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {'Content-Type': 'application/json'},
    body: options.body,
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
