import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { authStorage } from '../api';

type CurrentUser = {
  id: string;
  username: string;
  name: string;
  role: string;
};

type CurrentPeriod = {
  year: number;
  period: number;
};

type AppContextValue = {
  currentAccountSetId: string;
  currentAccountSetName: string;
  currentOrganization: string;
  currentPeriod: number;
  currentYear: number;
  currentUser: string;
  currentUsername: string;
  currentUserName: string;
  currentRole: string;
  isAuthenticated: boolean;
  setCurrentAccountSet: (id: string, name: string, organization?: string) => void;
  clearCurrentAccountSet: () => void;
  setCurrentPeriod: (year: number, period: number) => void;
  setCurrentUser: (user: CurrentUser, accessToken: string) => void;
  clearCurrentUser: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [accountSet, setAccountSet] = useState({
    id: localStorage.getItem('ais.currentAccountSetId') ?? '',
    name: localStorage.getItem('ais.currentAccountSetName') ?? '未选择账套',
    organization: localStorage.getItem('ais.currentOrganization') ?? '',
  });
  const [period, setPeriod] = useState<CurrentPeriod>({
    year: Number(localStorage.getItem('ais.currentYear')) || new Date().getFullYear(),
    period: Number(localStorage.getItem('ais.currentPeriod')) || 1,
  });
  const [user, setUser] = useState<CurrentUser | null>(() => {
    if (!authStorage.hasSession()) {
      return null;
    }
    const currentUserId = authStorage.currentUserId();
    return {
      id: currentUserId,
      username: localStorage.getItem('ais.currentUsername') ?? currentUserId,
      name: localStorage.getItem('ais.currentUserName') ?? currentUserId,
      role: localStorage.getItem('ais.currentUserRole') ?? '未设置角色',
    };
  });
  const setCurrentPeriod = useCallback((year: number, periodNo: number) => {
    localStorage.setItem('ais.currentYear', String(year));
    localStorage.setItem('ais.currentPeriod', String(periodNo));
    setPeriod((currentPeriod) => {
      if (currentPeriod.year === year && currentPeriod.period === periodNo) {
        return currentPeriod;
      }
      return { year, period: periodNo };
    });
  }, []);
  const clearCurrentAccountSet = useCallback(() => {
    localStorage.removeItem('ais.currentAccountSetId');
    localStorage.removeItem('ais.currentAccountSetName');
    localStorage.removeItem('ais.currentOrganization');
    setAccountSet({ id: '', name: '未选择账套', organization: '' });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      currentAccountSetId: accountSet.id,
      currentAccountSetName: accountSet.name,
      currentOrganization: accountSet.organization,
      currentPeriod: period.period,
      currentYear: period.year,
      currentUser: user?.id ?? '',
      currentUsername: user?.username ?? '',
      currentUserName: user?.name ?? '未登录',
      currentRole: user?.role ?? '未登录',
      isAuthenticated: Boolean(user),
      setCurrentAccountSet: (id, name, organization) => {
        const nextOrganization = organization || name || accountSet.organization || '总部';
        localStorage.setItem('ais.currentAccountSetId', id);
        localStorage.setItem('ais.currentAccountSetName', name);
        localStorage.setItem('ais.currentOrganization', nextOrganization);
        setAccountSet({ id, name, organization: nextOrganization });
      },
      clearCurrentAccountSet,
      setCurrentPeriod,
      setCurrentUser: (nextUser, accessToken) => {
        authStorage.setSession(accessToken, nextUser.id);
        localStorage.setItem('ais.currentUsername', nextUser.username);
        localStorage.setItem('ais.currentUserName', nextUser.name);
        localStorage.setItem('ais.currentUserRole', nextUser.role);
        setUser(nextUser);
      },
      clearCurrentUser: () => {
        authStorage.clearSession();
        localStorage.removeItem('ais.currentUsername');
        localStorage.removeItem('ais.currentUserName');
        localStorage.removeItem('ais.currentUserRole');
        setUser(null);
      },
    }),
    [accountSet, clearCurrentAccountSet, period, setCurrentPeriod, user],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used inside AppProvider.');
  }
  return context;
}
