import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';

import * as authService from '../../services/authService';
import { ApiUser, setStoredToken } from '@didhub/api-client';
import { getMe } from '../hooks/useMe';

// Lightweight local types to avoid runtime dependency on generated client
class ApiError extends Error {
  data: any;
  constructor(message?: string, data?: any) {
    super(message);
    this.data = data;
  }
}

function getTokenExp(token: string | null): number | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload || typeof payload.exp !== 'number') return null;
    return payload.exp as number;
  } catch {
    return null;
  }
}

/**
 * Shape of the authentication context.
 */
type AuthContextShape = {
  /** Current authenticated user or null if not logged in */
  user: ApiUser | null;
  /** Function to manually set the current user */
  setUser: (u: ApiUser | null) => void;
  /** Function to refetch the current user from the server */
  refetchUser: () => Promise<void>;
  /** Whether the user must change their password */
  mustChange: boolean;
  /** Login function */
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: boolean; user?: ApiUser; pending?: boolean; error?: string | null }>;
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
  const [me, setMe] = useState<ApiUser | null>(() => {
    try {
      const raw = localStorage.getItem('didhub_me');
      return raw ? (JSON.parse(raw) as ApiUser) : null;
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
      try {
        const r: any = await authService.refresh();
        refreshingRef.current = false;
        if (!r || !r.token) {
          await logout();
          return;
        }
        try {
          localStorage.setItem('didhub_jwt', r.token);
        } catch {
          // Ignore localStorage errors
        }
        const newExp = r.token ? getTokenExp(r.token) : null;
        setTokenExp(newExp);
        scheduleRefresh(newExp);
      } catch {
        refreshingRef.current = false;
        await logout();
      }
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
    const handler: EventListener = () => {
      setMustChange(true);
    };
    window.addEventListener('didhub:must-change-password', handler);
    return () => window.removeEventListener('didhub:must-change-password', handler);
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
    try {
      const result = await authService.login(username, password);
      if (result) {
        // Persist token immediately so subsequent API calls include Authorization header
        try {
          if ((result as any).token) setStoredToken((result as any).token);
        } catch {
          // Ignore storage errors
        }
        // After auth, fetch /me to populate user object
        const session = await authService.getMe();
        const user = session ?? null;
        setMe(user as ApiUser | null);
        if (user && (user as any).must_change_password) setMustChange(true);
        initTokenState();
        return { ok: true, user };
      }
      return { ok: false, error: 'Login failed' };
    } catch (error) {
      if (error instanceof ApiError) {
        const data = error.data as any;
        const code = data?.code;
        if (code === 'not_approved') {
          return { ok: false, pending: true, error: data?.error ?? 'Account awaiting approval' };
        }
        return { ok: false, error: data?.error ?? error.message ?? 'Login failed' };
      }
      return { ok: false, error: 'An unexpected error occurred' };
    }
  }
  async function register(username: string, password: string, is_system = false) {
    try {
      const r = await authService.register(username, password, is_system);
      if (r && (r as any).ok) {
        return { ok: true, pending: true };
      }
      return { ok: false, error: (r as any)?.error ?? null };
    } catch (error) {
      if (error instanceof ApiError) {
        const data = error.data as any;
        return { ok: false, error: data?.error ?? data?.message ?? error.message ?? null };
      }
      return { ok: false, error: 'An unexpected error occurred' };
    }
  }
  async function logout() {
    setMe(null);
    setMustChange(false);
    setTokenExp(null);
    if (refreshTimer.current) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }
  async function changePassword(current: string, next: string) {
    const res = await authService.changePassword({ current_password: current, new_password: next } as any);
    if (res && (res as any).ok) {
      setMustChange(false);
      try {
        const m = await authService.getMe();
        setMe(m ?? null);
      } catch {
        // Ignore fetch errors
      }
      return { ok: true };
    }
    return { ok: false, error: (res as any)?.error ?? 'error' };
  }
  const refetchUser = useCallback(() => getMe().then(setMe), []);

  return (
    <AuthContext.Provider
      value={{ user: me, setUser: setMe, refetchUser, mustChange, login, logout, register, changePassword, tokenExp }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Global listeners mounted once (outside provider usage) could also manage 401 events: integrated here for simplicity.
declare global {
  interface Window {
    __didhub_refreshing?: boolean;
  }
}

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
      if (window.__didhub_refreshing) return;
      window.__didhub_refreshing = true;
      (async () => {
        try {
          try {
            const r = await authService.refresh();
            if (r && (r as any).token) {
              localStorage.setItem('didhub_jwt', (r as any).token);
              window.__didhub_refreshing = false;
              return;
            }
          } catch {
            // ignore
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
