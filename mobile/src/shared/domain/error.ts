import type { ErrorItem } from '../api/types';

export const CHOICE_KEYS = ['A', 'B', 'C', 'D'] as const;
export type ChoiceKey = (typeof CHOICE_KEYS)[number];

export function isChoiceQuestion(item: ErrorItem): boolean {
  return item.question_type === 'choice';
}

export function optionOf(item: ErrorItem, key: ChoiceKey): string {
  switch (key) {
    case 'A':
      return item.option_a || '';
    case 'B':
      return item.option_b || '';
    case 'C':
      return item.option_c || '';
    case 'D':
      return item.option_d || '';
    default:
      return '';
  }
}

export function questionOf(item: ErrorItem): string {
  return item.content || item.question_content || '';
}

export function answerOf(item: ErrorItem): string {
  return item.answer || '';
}
