import type { QuestionType } from '../api/types';

/**
 * 手机端 OCR：
 * 1) 图片在手机上压到 1200px，取 base64 后直接调用百度通用文字识别；
 * 2) 百度失败（无网 / 额度 / 凭据）时由 EntryScreen 回退到 ML Kit；
 * 3) 识别文本用本地规则拆科目、题干、答案和 A-D 选项。
 *
 * 这里不经过电脑后端，APK 在手机上可独立完成拍照录题。
 * 注意：百度密钥会被打进 APK，正式发布时应改为自己的受限凭据。
 */
import {
  BAIDU_OCR_API_KEY,
  BAIDU_OCR_SECRET_KEY,
} from './ocrKeys';
import { parsePage } from './ocrSplit';

/** 没配密钥时跳过百度，直接让调用方退回手机本地识别。 */
const hasBaiduKeys = Boolean(BAIDU_OCR_API_KEY && BAIDU_OCR_SECRET_KEY);

const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const OCR_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic';


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

export interface OcrParseResult {
  raw_text: string;
  subject: string;
  question_type: QuestionType;
  question_content: string;
  answer: string;
  parser: 'llm' | 'local' | string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  /** 切出来的所有题，按卷面顺序；本地规则当前返回一道。 */
  questions?: OcrQuestion[];
  question_count?: number;
  header?: string;
}

interface BaiduTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface BaiduOcrResponse {
  words_result?: Array<{words?: string}>;
  error_code?: number;
  error_msg?: string;
}

let tokenCache: {value: string; expiresAt: number} | null = null;

function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return task(controller.signal)
    .catch(error => {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(message);
      }
      throw error;
    })
    .finally(() => clearTimeout(timer));
}

async function getAccessToken(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.value;
  }

  const url =
    `${TOKEN_URL}?grant_type=client_credentials` +
    `&client_id=${encodeURIComponent(BAIDU_OCR_API_KEY)}` +
    `&client_secret=${encodeURIComponent(BAIDU_OCR_SECRET_KEY)}`;

  const response = await withTimeout(
    signal => fetch(url, {method: 'GET', signal}),
    20000,
    '连接百度 OCR 超时，请检查手机网络',
  );
  const text = await response.text();
  let body: BaiduTokenResponse;
  try {
    body = text ? (JSON.parse(text) as BaiduTokenResponse) : {};
  } catch {
    throw new Error('百度 OCR 认证返回了无法解析的内容');
  }

  if (!response.ok || !body.access_token) {
    const detail =
      body.error_description || body.error || `HTTP ${response.status}`;
    throw new Error(`百度 OCR 认证失败：${detail}`);
  }

  const expiresIn = Number(body.expires_in);
  tokenCache = {
    value: body.access_token,
    expiresAt:
      Date.now() +
      Math.max(
        60,
        (Number.isFinite(expiresIn) ? expiresIn : 2592000) - 300,
      ) * 1000,
  };
  return body.access_token;
}

function baiduErrorMessage(body: BaiduOcrResponse): string {
  const code = body.error_code;
  const message = body.error_msg || '未知错误';
  if (code !== undefined && [6, 14, 100, 110, 111].includes(code)) {
    return `百度 OCR 凭据无效（Code ${code}: ${message}）`;
  }
  if (code !== undefined && [17, 18, 19, 20].includes(code)) {
    return `百度 OCR 今日额度或频率超限（Code ${code}: ${message}）`;
  }
  if (
    code !== undefined &&
    [216200, 216201, 216202, 216203, 282003].includes(code)
  ) {
    return `图片无法识别（Code ${code}: ${message}），换一张更清晰的试试`;
  }
  return `百度 OCR 返回错误（Code ${code ?? '-'}: ${message}）`;
}

async function requestBaiduOcr(
  imageBase64: string,
  token: string,
): Promise<BaiduOcrResponse> {
  const body = `image=${encodeURIComponent(imageBase64)}`;
  const url = `${OCR_URL}?access_token=${encodeURIComponent(token)}`;
  const response = await withTimeout(
    signal =>
      fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body,
        signal,
      }),
    45000,
    '百度 OCR 识别超时，请检查手机网络',
  );
  const text = await response.text();
  let data: BaiduOcrResponse;
  try {
    data = text ? (JSON.parse(text) as BaiduOcrResponse) : {};
  } catch {
    throw new Error('百度 OCR 返回了无法解析的内容');
  }
  if (!response.ok && data.error_code === undefined) {
    throw new Error(`百度 OCR 请求失败（HTTP ${response.status}）`);
  }
  return data;
}

export async function recognizeWithBaidu(
  imageBase64: string,
): Promise<string> {
  if (!hasBaiduKeys) {
    throw new Error('还没配百度 OCR 密钥，请用手机本地识别');
  }

  const base64 = imageBase64
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
    .replace(/\s+/g, '')
    .trim();
  if (!base64) {
    throw new Error('图片数据为空，请重新拍照');
  }

  let token = await getAccessToken();
  let data = await requestBaiduOcr(base64, token);
  if (data.error_code === 110 || data.error_code === 111) {
    token = await getAccessToken(true);
    data = await requestBaiduOcr(base64, token);
  }
  if (data.error_code !== undefined) {
    throw new Error(baiduErrorMessage(data));
  }

  const text = (data.words_result || [])
    .map(item => String(item.words || ''))
    .join('\n')
    .trim();
  if (!text) {
    throw new Error('这张图里没识别出文字，换一张更清晰的试试');
  }
  return text;
}

export function cleanOcrText(text: string): string {
  return text
    .replace(/\u00e8/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\u[0-9a-fA-F]{4}/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function parseOcrText(rawText: string): OcrParseResult {
  const text = cleanOcrText(rawText);
  if (!text) {
    throw new Error('没有识别到文字，请换个角度再拍一张');
  }

  const parsed = parsePage(text);
  if (!parsed.length) {
    throw new Error('没有识别到文字，请换个角度再拍一张');
  }

  const questions: OcrQuestion[] = parsed.map((item, index) => ({
    index: index + 1,
    number: item.number || index + 1,
    subject: item.subject,
    question_type: item.questionTypeLabel,
    question_content: item.questionContent,
    answer: item.answer,
    options: item.options as Record<string, string> | undefined,
    parser: 'local',
  }));

  const first = questions[0];

  return {
    raw_text: text,
    subject: first.subject,
    question_type: parsed[0].questionType,
    question_content: first.question_content,
    answer: first.answer,
    parser: 'local',
    option_a: first.options?.A || '',
    option_b: first.options?.B || '',
    option_c: first.options?.C || '',
    option_d: first.options?.D || '',
    questions,
    question_count: questions.length,
  };
}

export function toOcrQuestions(result: OcrParseResult): OcrQuestion[] {
  if (result.questions && result.questions.length) {
    return result.questions;
  }
  const optionEntries = [
    ['A', result.option_a],
    ['B', result.option_b],
    ['C', result.option_c],
    ['D', result.option_d],
  ].filter(([, value]) => Boolean(value && String(value).trim()));
  const options = optionEntries.length
    ? Object.fromEntries(optionEntries.map(([key, value]) => [key, value]))
    : undefined;
  return [
    {
      index: 1,
      number: 1,
      subject: result.subject || '',
      question_type: result.question_type || 'fill',
      question_content: result.question_content || result.raw_text || '',
      answer: result.answer || '',
      options,
      parser: result.parser,
    },
  ];
}
