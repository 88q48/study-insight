/**
 * 兼容层：页面仍然从 shared/api/client 导入，但所有数据操作
 * 已改为手机本地实现，不再请求电脑上的 FastAPI 服务。
 *
 * 原来的接口函数签名保持不变，因此 PracticeSession、StudyScreen、
 * MistakesScreen、EntryScreen 和 ProfileScreen 不需要各自改调用方式。
 */
export {
  createError,
  deleteError,
  fetchAnalysis,
  fetchErrors,
  fetchPracticeErrors,
  fetchSubjects,
  markMastered,
  parseOcrImage,
  parseOcrText,
  recordAttempt,
  toOcrQuestions,
  uploadUsageEvents,
} from '../local/localApi';
export type {
  AttemptResult,
  OcrParseResult,
  OcrQuestion,
} from '../local/localApi';
