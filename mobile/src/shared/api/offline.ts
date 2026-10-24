import seed from './offlineSeed.json';

/**
 * 没有后端时用的本地兜底。
 *
 * 录演示视频、或者把包装到别人手机上，都不可能保证那边有个 FastAPI 在跑。
 * 所以内置了一份真实数据的快照（121 道错题 + 看板统计），请求发不出去时
 * 就从这里读，界面照常显示，写操作也照样记下 —— 保存的错题会真的出现在
 * 列表里，看板数字跟着动。
 *
 * 只有网络层失败才走这里。服务器返回 4xx/5xx 是真实错误，该报就报，
 * 不能拿假数据糊过去。
 */

type Json = Record<string, any>;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const seedData = seed as Json;

/** 离线状态下会变的那份错题表，初次从内置快照深拷贝。 */
let rows: Json[] = clone(seedData.errors?.items ?? []);

/** 这张表是不是已经被改过（保存、掌握、删除都算）。 */
let mutated = false;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function errorStats(list: Json[]) {
  const total = list.length;
  const mastered = list.filter(row => row.mastered).length;
  return {
    total_errors: total,
    mastered_errors: mastered,
    reviewing_errors: total - mastered,
    mastery_rate: total ? round1((mastered / total) * 100) : 0,
  };
}

/** 按科目重算分布。改过数据之后必须重算，不然两张卡对不上。 */
function subjectDistribution(list: Json[]) {
  const bucket = new Map<string, Json[]>();
  for (const row of list) {
    const key = String(row.subject || '未分类');
    if (!bucket.has(key)) {
      bucket.set(key, []);
    }
    bucket.get(key)!.push(row);
  }
  return [...bucket.entries()]
    .map(([subject, group]) => {
      const mastered = group.filter(row => row.mastered).length;
      return {
        subject,
        error_count: group.length,
        mastered_count: mastered,
        reviewing_count: group.length - mastered,
        mastery_rate: round1((mastered / group.length) * 100),
      };
    })
    .sort((a, b) => b.error_count - a.error_count);
}

function analysisPayload() {
  const base = clone(seedData.analysis ?? {});
  if (!mutated) {
    return base;
  }
  base.error_stats = errorStats(rows);
  base.subject_distribution = subjectDistribution(rows);
  return base;
}

function findRow(errorId: string): Json | undefined {
  return rows.find(row => String(row.error_id) === errorId);
}

/** 判一道题答得对不对。选择题比字母，其他题比文本。 */
function judgeAnswer(row: Json, answer: string): boolean {
  const expected = String(row.answer ?? '').trim();
  const got = String(answer ?? '').trim();
  if (!expected || !got) {
    return false;
  }
  if (row.question_type === '选择') {
    return expected.toUpperCase() === got.toUpperCase();
  }
  const normalize = (text: string) => text.replace(/\s+/g, '').toLowerCase();
  return normalize(expected) === normalize(got);
}

/**
 * 把一次请求映射成离线应答。返回 null 表示这条路走不了，
 * 调用方应该把原来的错误抛出去。
 */
export function handleOffline(
  path: string,
  method: string,
  body?: string,
): unknown | null {
  const verb = (method || 'GET').toUpperCase();
  const cleanPath = path.split('?')[0];
  const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);

  // --- 错题列表 ---------------------------------------------------------
  if (cleanPath === '/api/v1/errors' && verb === 'GET') {
    const limit = Number(params.get('limit') || 50);
    return {
      total: rows.length,
      items: rows.slice(0, Number.isFinite(limit) ? limit : 50),
    };
  }

  // --- 新增错题 ---------------------------------------------------------
  if (cleanPath === '/api/v1/errors' && verb === 'POST') {
    const payload = body ? JSON.parse(body) : {};
    const errorId = String(payload.error_id || `err_local_${Date.now()}`);
    const row: Json = {
      ...payload,
      error_id: errorId,
      attempt_count: 0,
      correct_count: 0,
      wrong_count: 0,
      accuracy: 0,
      mastered: Boolean(payload.mastered),
      review_count: 0,
    };
    rows = [row, ...rows];
    mutated = true;
    return {status: 'success', error_id: errorId, message: '错题已保存'};
  }

  // --- 科目分布（固定段，必须排在 {id} 前面判）---------------------------
  if (cleanPath === '/api/v1/errors/subjects' && verb === 'GET') {
    const dist = subjectDistribution(rows);
    return {
      total: dist.length,
      subjects: dist.map(item => ({
        subject: item.subject,
        count: item.error_count,
      })),
    };
  }

  // --- 练习队列 ---------------------------------------------------------
  if (cleanPath === '/api/v1/errors/practice' && verb === 'GET') {
    const limit = Number(params.get('limit') || 10);
    const subject = params.get('subject');
    let list = rows.filter(row => !row.mastered);
    if (subject) {
      list = list.filter(row => String(row.subject ?? '').includes(subject));
    }
    return {
      total: list.length,
      subject: subject || null,
      items: list.slice(0, Number.isFinite(limit) ? limit : 10),
    };
  }

  // --- 看板统计 ---------------------------------------------------------
  if (cleanPath.startsWith('/api/v1/devices/') && cleanPath.endsWith('/analysis')) {
    return analysisPayload();
  }

  // --- 单条错题：改 / 删 ------------------------------------------------
  const singleMatch = /^\/api\/v1\/errors\/([^/]+)$/.exec(cleanPath);
  if (singleMatch) {
    const errorId = decodeURIComponent(singleMatch[1]);
    const row = findRow(errorId);

    if (verb === 'PATCH') {
      const payload = body ? JSON.parse(body) : {};
      if (row) {
        if (payload.mastered !== undefined) {
          row.mastered = Boolean(payload.mastered);
          row.mastered_at = row.mastered ? new Date().toISOString() : null;
        }
        if (payload.review_count !== undefined) {
          row.review_count = Number(payload.review_count) || 0;
        }
        mutated = true;
      }
      return {status: 'success', error: row ?? null};
    }

    if (verb === 'DELETE') {
      rows = rows.filter(item => String(item.error_id) !== errorId);
      mutated = true;
      return {status: 'success', deleted: true, error_id: errorId};
    }
  }

  // --- 作答记录 ---------------------------------------------------------
  const attemptMatch = /^\/api\/v1\/errors\/([^/]+)\/attempts$/.exec(cleanPath);
  if (attemptMatch && verb === 'POST') {
    const errorId = decodeURIComponent(attemptMatch[1]);
    const payload = body ? JSON.parse(body) : {};
    const row = findRow(errorId);
    let correct = false;
    if (row) {
      correct = judgeAnswer(row, payload.answer);
      row.attempt_count = Number(row.attempt_count || 0) + 1;
      if (correct) {
        row.correct_count = Number(row.correct_count || 0) + 1;
      } else {
        row.wrong_count = Number(row.wrong_count || 0) + 1;
      }
      const attempts = Number(row.attempt_count) || 1;
      row.accuracy = round1((Number(row.correct_count) || 0) / attempts * 100);
      mutated = true;
    }
    return {status: 'success', correct, error: row ?? null};
  }

  return null;
}

/** 离线兜底是否接管过某个请求，调试用。 */
export function offlineErrorCount(): number {
  return rows.length;
}
