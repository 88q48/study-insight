import { readPreference, writePreference } from '../storage/preferences';
import { hashPassword, makeSalt } from './sha256';

/**
 * 本机账户。
 *
 * 只有本地，没有服务端。用户名和密码哈希存在 SharedPreferences 里，
 * 每个账户的题库单独一份（见 localDb 的 storageKey）。
 *
 * 不是真正的身份认证：知道设备的人能看到账户列表。它的作用是
 * 「别把 A 的错题给 B 看」，以及让每个人从空库开始。
 */

const STORAGE_KEY = 'accounts_v1';

/** 示例账户的固定 id，不进正常账户列表。 */
export const DEMO_ACCOUNT_ID = 'demo';
export const DEMO_ACCOUNT_NAME = '示例账户';

export interface Account {
  id: string;
  name: string;
  salt: string;
  hash: string;
  createdAt: number;
  isDemo?: boolean;
}

interface AccountStore {
  accounts: Account[];
  /** 上次登录的账户 id，用来免密进入 */
  lastId: string;
}

const EMPTY_STORE: AccountStore = {accounts: [], lastId: ''};

function normalize(raw: string): AccountStore {
  if (!raw) {
    return {...EMPTY_STORE, accounts: []};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {...EMPTY_STORE, accounts: []};
  }
  if (!parsed || typeof parsed !== 'object') {
    return {...EMPTY_STORE, accounts: []};
  }
  const value = parsed as Partial<AccountStore>;
  const accounts = Array.isArray(value.accounts)
    ? value.accounts.filter(
        (item): item is Account =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as Account).id === 'string' &&
          typeof (item as Account).name === 'string' &&
          typeof (item as Account).salt === 'string' &&
          typeof (item as Account).hash === 'string',
      )
    : [];
  return {
    accounts,
    lastId: typeof value.lastId === 'string' ? value.lastId : '',
  };
}

async function loadStore(): Promise<AccountStore> {
  return normalize(await readPreference(STORAGE_KEY, ''));
}

async function saveStore(store: AccountStore): Promise<void> {
  await writePreference(STORAGE_KEY, JSON.stringify(store));
}

function makeId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 0x10000).toString(36)}`;
}

export type AuthError =
  | 'name_too_short'
  | 'name_too_long'
  | 'name_taken'
  | 'name_reserved'
  | 'password_too_short'
  | 'password_too_long'
  | 'not_found'
  | 'wrong_password';

export const AUTH_ERROR_TEXT: Record<AuthError, string> = {
  name_too_short: '用户名至少 2 个字',
  name_too_long: '用户名最多 12 个字',
  name_taken: '这个名字已经有人用了',
  name_reserved: '这个名字留给示例账户了，换一个吧',
  password_too_short: '密码至少 4 位',
  password_too_long: '密码最多 20 位',
  not_found: '没有这个账户',
  wrong_password: '密码不对',
};

export type AuthResult =
  | {ok: true; account: Account}
  | {ok: false; error: AuthError};

export const NAME_RULE = {min: 2, max: 12};
export const PASSWORD_RULE = {min: 4, max: 20};

function validateName(rawName: string): AuthError | null {
  const name = rawName.trim();
  if (name.length < NAME_RULE.min) {
    return 'name_too_short';
  }
  if (name.length > NAME_RULE.max) {
    return 'name_too_long';
  }
  if (name === DEMO_ACCOUNT_NAME || name.toLowerCase() === DEMO_ACCOUNT_ID) {
    return 'name_reserved';
  }
  return null;
}

function validatePassword(password: string): AuthError | null {
  if (password.length < PASSWORD_RULE.min) {
    return 'password_too_short';
  }
  if (password.length > PASSWORD_RULE.max) {
    return 'password_too_long';
  }
  return null;
}

/** 注册新账户。重名不区分大小写，避免「Eric」和「eric」撞车。 */
export async function registerAccount(
  rawName: string,
  password: string,
): Promise<AuthResult> {
  const name = rawName.trim();
  const nameError = validateName(name);
  if (nameError) {
    return {ok: false, error: nameError};
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return {ok: false, error: passwordError};
  }

  const store = await loadStore();
  const lower = name.toLowerCase();
  if (store.accounts.some(item => item.name.toLowerCase() === lower)) {
    return {ok: false, error: 'name_taken'};
  }

  const salt = makeSalt();
  const account: Account = {
    id: makeId(),
    name,
    salt,
    hash: hashPassword(password, salt),
    createdAt: Date.now(),
  };
  store.accounts.push(account);
  store.lastId = account.id;
  await saveStore(store);
  return {ok: true, account};
}

/** 登录。成功会记下 lastId，下次打开直接进。 */
export async function verifyAccount(
  rawName: string,
  password: string,
): Promise<AuthResult> {
  const name = rawName.trim();
  const store = await loadStore();
  const lower = name.toLowerCase();
  const account = store.accounts.find(
    item => item.name.toLowerCase() === lower,
  );
  if (!account) {
    return {ok: false, error: 'not_found'};
  }
  if (hashPassword(password, account.salt) !== account.hash) {
    return {ok: false, error: 'wrong_password'};
  }
  store.lastId = account.id;
  await saveStore(store);
  return {ok: true, account};
}

/** 列出所有真实账户（不含示例账户）。设置页切换账户用。 */
export async function listAccounts(): Promise<Account[]> {
  const store = await loadStore();
  return store.accounts.filter(item => !item.isDemo);
}

/** 取上次登录的账户，用于免密进入。账户被删了就返回 null。 */
export async function getLastAccount(): Promise<Account | null> {
  const store = await loadStore();
  if (!store.lastId) {
    return null;
  }
  return store.accounts.find(item => item.id === store.lastId) ?? null;
}

/** 按 id 取账户。 */
export async function getAccount(id: string): Promise<Account | null> {
  const store = await loadStore();
  return store.accounts.find(item => item.id === id) ?? null;
}

/** 退出登录：只清 lastId，账户还在，下次输密码能回来。 */
export async function clearLastAccount(): Promise<void> {
  const store = await loadStore();
  store.lastId = '';
  await saveStore(store);
}

/** 删除账户。题库要调用方自己去清。 */
export async function removeAccount(id: string): Promise<void> {
  const store = await loadStore();
  store.accounts = store.accounts.filter(item => item.id !== id);
  if (store.lastId === id) {
    store.lastId = '';
  }
  await saveStore(store);
}

/**
 * 确保示例账户存在，并把它设为当前账户。
 *
 * 示例账户没有密码——它不是给人登录的，是从设置页点进去看看完整数据长什么样。
 * 所以 hash 存一个不可能被算出来的值，verifyAccount 永远不会匹配到它。
 */
export async function enterDemoAccount(): Promise<Account> {
  const store = await loadStore();
  let demo = store.accounts.find(item => item.id === DEMO_ACCOUNT_ID);
  if (!demo) {
    demo = {
      id: DEMO_ACCOUNT_ID,
      name: DEMO_ACCOUNT_NAME,
      salt: 'demo',
      // 占位。示例账户不参与密码校验
      hash: 'x',
      createdAt: Date.now(),
      isDemo: true,
    };
    store.accounts.push(demo);
  }
  store.lastId = DEMO_ACCOUNT_ID;
  await saveStore(store);
  return demo;
}

/** 记下当前账户（切账户时用，不校验密码）。 */
export async function setLastAccount(id: string): Promise<void> {
  const store = await loadStore();
  store.lastId = id;
  await saveStore(store);
}

/** 有没有任何真实账户——决定首屏是「注册」还是「登录」。 */
export async function hasRealAccounts(): Promise<boolean> {
  const store = await loadStore();
  return store.accounts.some(item => !item.isDemo);
}
