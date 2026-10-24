import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  DEMO_ACCOUNT_ID,
  clearLastAccount,
  enterDemoAccount,
  getAccount,
  getLastAccount,
  registerAccount,
  setAccountAvatar,
  setLastAccount,
  verifyAccount,
} from './accounts';
import type { Account, AuthResult } from './accounts';
import {
  seedDemoData,
  setActiveAccount,
} from '../local/localDb';

/**
 * 当前登录的账户。
 *
 * 启动时读上次登录的账户，有就直接进——不然每次打开都要输密码，
 * 演示现场很难看，日常用也烦。
 *
 * 切账户的时候要先 setActiveAccount()（换题库），再更新 React state
 * （换界面）。顺序反了会有一瞬间读到上一个人的数据。
 */

interface AccountContextValue {
  account: Account | null;
  /** 首次读取完成前为 true，避免先闪一下登录页 */
  loading: boolean;
  isDemo: boolean;
  register: (name: string, password: string) => Promise<AuthResult>;
  login: (name: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  /** 进示例账户，首次会灌 121 道 */
  enterDemo: () => Promise<void>;
  /** 从示例账户回到指定账户 */
  switchTo: (id: string) => Promise<void>;
  /** 换当前账户的头像 */
  updateAvatar: (uri: string) => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/** 切账户的统一入口：先换题库，再换状态。 */
async function activate(target: Account): Promise<void> {
  setActiveAccount(target.id);
  await setLastAccount(target.id);
}

export function AccountProvider({children}: {children: React.ReactNode}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getLastAccount()
      .then(async last => {
        if (!mounted) {
          return;
        }
        if (!last) {
          setLoading(false);
          return;
        }
        setActiveAccount(last.id);
        // 上次停在这个账户，数据要跟上
        setAccount(last);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const register = useCallback(async (name: string, password: string) => {
    const result = await registerAccount(name, password);
    if (result.ok) {
      await activate(result.account);
      setAccount(result.account);
    }
    return result;
  }, []);

  const login = useCallback(async (name: string, password: string) => {
    const result = await verifyAccount(name, password);
    if (result.ok) {
      await activate(result.account);
      setAccount(result.account);
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    await clearLastAccount();
    // 清空当前账户，下次进来必须输密码
    setAccount(null);
  }, []);

  const enterDemo = useCallback(async () => {
    const demo = await enterDemoAccount();
    setActiveAccount(demo.id);
    // 首次进示例账户时灌种子。已有数据时 seedDemoData 会跳过，
    // 所以点两次也不会变 242 道。
    await seedDemoData();
    setAccount(demo);
  }, []);

  const updateAvatar = useCallback(
    async (uri: string) => {
      if (!account) {
        return;
      }
      const next = await setAccountAvatar(account.id, uri);
      if (next) {
        setAccount(next);
      }
    },
    [account],
  );

  const switchTo = useCallback(async (id: string) => {
    const target = await getAccount(id);
    if (!target) {
      return;
    }
    await activate(target);
    setAccount(target);
  }, []);

  const value = useMemo(
    () => ({
      account,
      loading,
      isDemo: account?.id === DEMO_ACCOUNT_ID,
      register,
      login,
      logout,
      enterDemo,
      switchTo,
      updateAvatar,
    }),
    [
      account,
      loading,
      register,
      login,
      logout,
      enterDemo,
      switchTo,
      updateAvatar,
    ],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error('useAccount 必须在 AccountProvider 内使用');
  }
  return value;
}
