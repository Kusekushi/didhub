import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';

import {
  loginUser as apiLogin,
  registerUser as apiRegister,
  logoutUser as apiLogout,
  fetchMeVerified,
  User,
  refreshSession,
  changePassword as apiChangePassword,
  getTokenExp
} from '@didhub/api-client';

/**
 * Shape of the authentication context.
 */
type AuthContextShape = {
  /** Current authenticated user or null if not logged in */
  user: User | null;
  /** Function to manually set the current user */
  setUser: (u: User | null) => void;
  /** Whether the user must change their password */
  mustChange: boolean;
  /** Login function */
  login: (username: string, password: string) => Promise<{ ok: boolean; user?: User | null; error?: string | null }>;
  /** Logout function */
  logout: () => Promise<void>;
  /** Register function */
  register: (
    username: string,
    password: string,
    is_system?: boolean,
  ) => Promise<{ ok: boolean; pending?: boolean; error?: string | null }>;
  /** Change password function */
  changePassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string | null }>;
  /** JWT token expiration timestamp */
  tokenExp: number | null;
};

const AuthContext = createContext<AuthContextShape | null>(null);

/**
 * Authentication context provider component.
 *
 * Manages user authentication state, token refresh, and provides auth functions
 * to child components. Handles automatic token refresh and password change requirements.
 *
 * @param children - Child components that need access to auth context
 * @returns The provider component wrapping children
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('didhub_me');
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  });
  const [mustChange, setMustChange] = useState<boolean>(() => {
    try {
      const mc = localStorage.getItem('didhub_must_change');
      return mc === '1';
    } catch {
      return false;
    }
  });
  const [tokenExp, setTokenExp] = useState<number | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const refreshingRef = useRef<boolean>(false);

  const scheduleRefresh = useCallback((exp: number | null) => {
    if (refreshTimer.current) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
    if (!exp) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const lead = 60 * 5; // 5 minutes before expiry
    let delayMs = (exp - lead - nowSec) * 1000;
    if (delayMs < 0) delayMs = 5000; // soon
    refreshTimer.current = window.setTimeout(async () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      const r = await refreshSession();
      refreshingRef.current = false;
      if (!r.ok) {
        // Failed refresh -> trigger logout
        await logout();
        return;
      }
      // Update exp from new token
      const newExp = r.token ? getTokenExp(r.token) : null;
      setTokenExp(newExp);
      scheduleRefresh(newExp);
    }, delayMs) as unknown as number;
  }, []);

  const initTokenState = useCallback(() => {
    try {
      const raw = localStorage.getItem('didhub_jwt');
      const exp = raw ? getTokenExp(raw) : null;
      setTokenExp(exp);
      scheduleRefresh(exp);
    } catch {
      // Ignore localStorage errors
    }
  }, [scheduleRefresh]);

  useEffect(() => {
    initTokenState();
  }, [initTokenState]);
  useEffect(() => {
    try {
      if (mustChange) localStorage.setItem('didhub_must_change', '1');
      else localStorage.removeItem('didhub_must_change');
    } catch {
      // Ignore localStorage errors
    }
  }, [mustChange]);
  useEffect(() => {
    function handler() {
      setMustChange(true);
    }
    window.addEventListener('didhub:must-change-password', handler as any);
    return () => window.removeEventListener('didhub:must-change-password', handler as any);
  }, []);
  useEffect(() => {
    try {
      if (me) localStorage.setItem('didhub_me', JSON.stringify(me));
      else localStorage.removeItem('didhub_me');
    } catch {
      // Ignore localStorage errors
    }
  }, [me]);
  async function login(username: string, password: string) {
    const r = await apiLogin(username, password);
    if (r.status === 200) {
      try {
        const m = await fetchMeVerified();
        setMe(m);
        if (m && m.must_change_password) setMustChange(true);
        initTokenState();
        return { ok: true, user: m };
      } catch {
        initTokenState();
        return { ok: true, user: null };
      }
    }
    // If server indicates account is not yet approved, surface a pending flag so UI can redirect.
    const code = (r.json as any)?.code as string | undefined;
    if (code === 'not_approved') {
      return {
        ok: false,
        pending: true,
        error: ((r.json as any)?.error as string) || 'Account awaiting approval',
      } as any;
    }
    return { ok: false, error: ((r.json as any)?.error as string) || (r.text as string | null) };
  }
  async function register(username: string, password: string, is_system = false) {
    const r = await apiRegister(username, password, is_system);
    if (r.status === 200 || r.status === 201) {
      // Account created. Because new accounts require admin approval, don't auto-login.
      return { ok: true, pending: true };
    }
    return { ok: false, error: ((r.json as any)?.error as string) || (r.text as string | null) };
  }
  async function logout() {
    await apiLogout();
    setMe(null);
    setMustChange(false);
    setTokenExp(null);
    if (refreshTimer.current) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }
  async function changePassword(current: string, next: string) {
    const res = await apiChangePassword(current, next);
    if (res && res.status === 200) {
      setMustChange(false);
      try {
        const m = await fetchMeVerified();
        setMe(m);
      } catch {
        // Ignore fetch errors
      }
      return { ok: true };
    }
    const err = (res && (res.json as any)?.error) || (res && (res.text as any)) || 'error';
    return { ok: false, error: String(err) };
  }
  return (
    <AuthContext.Provider
      value={{ user: me, setUser: setMe, mustChange, login, logout, register, changePassword, tokenExp }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Global listeners mounted once (outside provider usage) could also manage 401 events: integrated here for simplicity.
if (typeof window !== 'undefined') {
  window.addEventListener('didhub:unauthorized', () => {
    try {
      // If we already have a token and user, attempt single refresh before forcing logout/redirect.
      const token = localStorage.getItem('didhub_jwt');
      if (!token) {
        window.location.href = '/login';
        return;
      }
      // Stash a flag to avoid multiple concurrent attempts across components.
      if ((window as any).__didhub_refreshing) return;
      (window as any).__didhub_refreshing = true;
      (async () => {
        try {
          const r = await refreshSession();
          if (r && r.ok && r.token) {
            localStorage.setItem('didhub_jwt', r.token);
            // Clear the refreshing flag immediately since the operation is complete
            (window as any).__didhub_refreshing = false;
            return;
          }
        } catch {
          // Ignore refresh errors
        }
        localStorage.removeItem('didhub_jwt');
        localStorage.removeItem('didhub_me');
        localStorage.removeItem('didhub_must_change');
        window.location.href = '/login';
      })();
    } catch {
      // Ignore errors during unauthorized handling
    }
  });
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
