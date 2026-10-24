import type { ChoiceKey } from '../domain/error';
import type { QuestionType } from '../api/types';

/** 选项字母。内联一份，避免运行时依赖，方便单独测。 */
const CHOICE_KEYS: readonly ChoiceKey[] = ['A', 'B', 'C', 'D'];

/**
 * 试卷文字解析：把 OCR 出来的一整页文字切成多道题。
 *
 * 这套规则在 backend/ocr_split.py 和 ocr_parser.py 里跑通过（26 个测试），
 * 这里把它搬到手机上，让拍照识别不用连电脑。两边逻辑要一起改，
 * 改完记得对着 backend/tests 的用例核一遍。
 *
 * 为什么不简单按行 split：百度 OCR 常把一整行选项压成「A.-1B.0C.3D.4」，
 * 空格全吃掉；也会把「答案与解析」黏在上一题尾巴上。逐行处理全都会错。
 */

/** 空白：普通空格、制表符、全角空格。 */
const WS = ' \t\u3000';
const WS_CLASS = `[${WS}]`;

/** 一行开头像不像新题的题号：1.  1、  1)  （1）第1题 */
const QUESTION_START = new RegExp(
  '^' + WS_CLASS + '*' +
    '(?:[（(]' + WS_CLASS + '*[）)]' + '|[（(][0-9]{1,3}[）)])?' +
    WS_CLASS + '*' +
    '(?:[0-9]{1,3}[.、)）．]|第[0-9]{1,3}题)',
);

/** 答案区起始标记。 */
const ANSWER_MARK = new RegExp(
  '(参考答案|答案与解析|答案解析|答案|解析|详解)' + WS_CLASS + '*[:：]?',
);

/** 答案区里的一条：整行锚定，免得题干里 f(2) 被当成第 2 题。 */
const ANSWER_ITEM = new RegExp(
  '^' + WS_CLASS + '*([0-9]{1,3})[.、．)）:：]' + WS_CLASS + '*(.+)',
);

/** 答案内容以选项字母开头。 */
const CHOICE_HEAD = new RegExp('^([A-Da-d])(' + WS_CLASS + '|$)');

/** 卷头特征词。 */
const HEADER_HINT =
  /(考试|模拟考|月考|期中|期末|试卷|答题卡|姓名|班级|学号|得分|满分|时间|分钟|高三|高二|高一|年级)/;

/** 选项标记：字母前要有空白或换行（严格规则）。 */
const OPTION_MARK_STRICT = /(?:^|\n|\s)([ABCD])[ \t\u3000]*[.．、:：)）][ \t\u3000]*/g;
/** 选项标记：字母前不要求空白。OCR 把空格吃掉时用这条。 */
const OPTION_MARK_LOOSE = /([ABCD])[ \t\u3000]*[.．、:：)）][ \t\u3000]*/g;

/** 全角空格压成普通空格，制表符也压成空格。 */
export function normalizeText(text: string): string {
  if (!text) {
    return '';
  }
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u3000/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** 从题号行读出真实题号，读不到返回 0。 */
export function takeNumber(line: string): number {
  let text = line.trim();
  text = text.replace(
    new RegExp('^' + WS_CLASS + '*[（(]' + WS_CLASS + '*[）)]' + WS_CLASS + '*'),
    '',
  );
  const m = new RegExp('^[（(]?第?' + WS_CLASS + '*([0-9]{1,3})').exec(text);
  return m ? parseInt(m[1], 10) : 0;
}

/** 这一行是不是卷头，不像题目。 */
export function looksLikeHeader(line: string): boolean {
  const s = line.trim();
  if (!s) {
    return true;
  }
  if (QUESTION_START.test(s)) {
    return false;
  }
  return s.length <= 30 && HEADER_HINT.test(s) && !s.includes('（') && !s.includes('(');
}

/** 从答案行里取出要填进「答案」框的部分。 */
function shortAnswer(raw: string): string {
  const m = CHOICE_HEAD.exec(raw);
  return m ? m[1].toUpperCase() : raw.trim();
}

/**
 * 在一行里找答案区标记，返回位置，找不到返回 -1。
 * 只认两种：行首就是标记，或者标记落在后半段。
 */
function findAnswerMark(line: string): number {
  let from = 0;
  while (from <= line.length) {
    const at = line.slice(from).search(ANSWER_MARK);
    if (at < 0) {
      return -1;
    }
    const pos = from + at;
    if (pos === 0 || pos >= Math.max(4, Math.floor(line.length / 2))) {
      return pos;
    }
    from = pos + 1;
  }
  return -1;
}

export interface SplitResult {
  /** 每道题的原始文本块 */
  blocks: string[];
  /** 题号 → 答案 */
  answers: Record<number, string>;
  /** 卷头（如「数学高三第一次模拟考」） */
  header: string;
}

/** 从答案区收集「题号 → 答案」。 */
function collectAnswers(answerLines: string[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (const ln of answerLines) {
    const m = ANSWER_ITEM.exec(ln.trim());
    if (!m) {
      continue;
    }
    const number = parseInt(m[1], 10);
    if (!Number.isFinite(number) || number <= 0) {
      continue;
    }
    out[number] = shortAnswer(m[2]);
  }
  return out;
}

/**
 * 把整页文字切成多道题。
 *
 * 切不出题号时，整段当一道题返回，保证不会因为格式奇怪就丢内容。
 */
export function splitQuestions(rawText: string): SplitResult {
  const text = normalizeText(rawText);
  if (!text) {
    return {blocks: [], answers: {}, header: ''};
  }

  const lines = text.split('\n');

  // 1. 找答案区起点。标记黏在上一题尾巴上时把那一行拆开。
  let answerFrom = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    const pos = findAnswerMark(trimmed);
    if (pos === 0) {
      answerFrom = i;
      break;
    }
    if (pos > 0) {
      lines[i] = trimmed.slice(0, pos).trim();
      answerFrom = i + 1;
      break;
    }
  }

  const bodyLines = lines.slice(0, answerFrom).filter(ln => ln.trim());
  const answerLines = lines.slice(answerFrom);
  const answers = collectAnswers(answerLines);

  // 2. 按题号切
  const blocks: string[][] = [];
  const headerLines: string[] = [];
  for (const ln of bodyLines) {
    if (QUESTION_START.test(ln)) {
      blocks.push([ln]);
    } else if (blocks.length) {
      blocks[blocks.length - 1].push(ln);
    } else {
      headerLines.push(ln);
    }
  }

  // 3. 切不出来就整段当一题
  if (!blocks.length) {
    return {
      blocks: [bodyLines.join('\n')],
      answers,
      header: '',
    };
  }

  return {
    blocks: blocks.map(group => group.join('\n')),
    answers,
    header: headerLines.join(' '),
  };
}

interface OptionRun {
  options: Record<string, string>;
  start: number;
  end: number;
}

function collectMarks(text: string, pattern: RegExp): Array<[string, number, number]> {
  const out: Array<[string, number, number]> = [];
  pattern.lastIndex = 0;
  let m = pattern.exec(text);
  while (m) {
    out.push([m[1], m.index, m.index + m[0].length]);
    if (m[0].length === 0) {
      pattern.lastIndex += 1;
    }
    m = pattern.exec(text);
  }
  return out;
}

/** 从候选标记里挑一组 A→B→C→D 且每段都有内容的。 */
function pickOptionRun(
  text: string,
  marks: Array<[string, number, number]>,
): OptionRun | null {
  const runs: Array<Array<[string, number, number]>> = [];
  let current: Array<[string, number, number]> = [];
  let expected = 'A';

  for (const mark of marks) {
    const letter = mark[0];
    if (letter === expected) {
      current.push(mark);
      expected = String.fromCharCode(expected.charCodeAt(0) + 1);
      if (current.length === 4) {
        runs.push(current);
        current = [];
        expected = 'A';
      }
    } else if (letter === 'A') {
      current = [mark];
      expected = 'B';
    } else {
      current = [];
      expected = 'A';
    }
  }

  for (let r = runs.length - 1; r >= 0; r -= 1) {
    const run = runs[r];
    const options: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < run.length; i += 1) {
      const stop = i + 1 < run.length ? run[i + 1][1] : text.length;
      let body = text.slice(run[i][2], stop).trim();
      if (i === 3) {
        for (const marker of ['【', '答案', '解析', '详解']) {
          const at = body.indexOf('\n' + marker);
          if (at >= 0) {
            body = body.slice(0, at).trim();
          }
        }
      }
      if (!body || body.length > 300) {
        ok = false;
        break;
      }
      options[run[i][0]] = body;
    }
    if (ok && Object.keys(options).length === 4) {
      return {options, start: run[0][1], end: run[3][2]};
    }
  }
  return null;
}

/**
 * 抽出 A/B/C/D 四个选项。
 *
 * 题干里也常出现「A、B 两点」，所以只认字母严格递增、四段都不空的那组。
 * 先按「字母前要有空白」严格找；找不到再放宽——百度常把选项间的空格
 * 全吃掉，压成「A.-1B.0C.3D.4」，严格规则一个都认不出来。
 */
export function extractOptions(text: string): OptionRun | null {
  const strict = pickOptionRun(text, collectMarks(text, OPTION_MARK_STRICT));
  if (strict) {
    return strict;
  }
  return pickOptionRun(text, collectMarks(text, OPTION_MARK_LOOSE));
}

/** 把文本切成 [题干, 答案]。 */
function splitAnswer(text: string): [string, string] {
  const at = text.search(ANSWER_MARK);
  if (at < 0) {
    return [text.trim(), ''];
  }
  const head = text.slice(0, at).trim();
  const tail = text.slice(at).replace(ANSWER_MARK, '').trim();
  return [head, tail];
}

/** 猜科目用的关键词。 */
const SUBJECT_WORDS: Record<string, string[]> = {
  数学: ['函数', '方程', '数列', '几何', '导数', '概率', 'sin', 'cos', '数学'],
  物理: ['质量', '速度', '加速度', '电流', '电压', '物理', '动能', '重力', '电阻'],
  化学: ['化学', '元素', '反应', '溶液', '摩尔', '氧化', '化合价'],
  生物: ['细胞', '遗传', '基因', '生态', '生物', '染色体'],
  语文: ['文言', '古诗', '作文', '阅读', '语文', '默写'],
  英语: ['English', 'the', 'passage', 'word', '英语', '完形'],
};

export function guessSubject(text: string): string {
  const hay = text.slice(0, 400);
  let best = '';
  let bestHits = 0;
  for (const [subject, words] of Object.entries(SUBJECT_WORDS)) {
    const hits = words.filter(w => hay.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = subject;
    }
  }
  return best;
}

export interface ParsedQuestion {
  /** 卷面题号，读不到为 0 */
  number: number;
  subject: string;
  questionType: QuestionType;
  /** 卷面题型原文：选择题 / 解答题 / 填空题 */
  questionTypeLabel: string;
  questionContent: string;
  answer: string;
  options?: Partial<Record<ChoiceKey, string>>;
}

/** 把一道题的文本块解析成填表需要的字段。 */
export function parseBlock(
  block: string,
  header: string,
  fallbackSubject: string,
): ParsedQuestion {
  const body = normalizeText(block);
  const found = extractOptions(body);

  let stem = body;
  if (found) {
    // 选项单独存一份，题干里就别再重复
    const head = body.slice(0, found.start);
    const tailRaw = body.slice(found.end);
    const tail = tailRaw.includes('\n')
      ? tailRaw.slice(tailRaw.indexOf('\n') + 1)
      : '';
    stem = (head + (tail.trim() ? '\n' + tail : '')).trim();
  }

  const [questionText, answerText] = splitAnswer(stem);
  const options = found
    ? (found.options as Partial<Record<ChoiceKey, string>>)
    : undefined;
  const hasOptions = Boolean(
    options && CHOICE_KEYS.some(key => (options[key] || '').trim().length > 0),
  );

  let label = '填空题';
  if (hasOptions) {
    label = '选择题';
  } else if (/[（(]\s*[12]\s*[）)]|求|证明|试求|求证/.test(questionText)) {
    label = '解答题';
  }

  return {
    number: takeNumber(block),
    subject: guessSubject(body) || guessSubject(header) || fallbackSubject,
    questionType: hasOptions ? 'choice' : 'fill',
    questionTypeLabel: label,
    questionContent: questionText,
    answer: answerText,
    options,
  };
}

/** 把一整页文字解析成多道题。这是入口。 */
export function parsePage(rawText: string, fallbackSubject = ''): ParsedQuestion[] {
  const {blocks, answers, header} = splitQuestions(rawText);
  if (!blocks.length) {
    return [];
  }
  return blocks.map(block => {
    const parsed = parseBlock(block, header, fallbackSubject);
    // 答案区按真实题号配；卷面题号缺失时退回顺序
    if (!parsed.answer && parsed.number && answers[parsed.number]) {
      parsed.answer = answers[parsed.number];
    }
    return parsed;
  });
}
