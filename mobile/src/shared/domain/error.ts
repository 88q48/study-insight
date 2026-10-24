import type { ErrorItem } from '../api/types';

export function questionOf(item: ErrorItem): string {
  return item.content || item.question_content || '';
}

export function answerOf(item: ErrorItem): string {
  return item.answer || '';
}
