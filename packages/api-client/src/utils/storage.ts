export function getStoredToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('didhub_jwt');
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('didhub_jwt', token);
    }
  } catch {}
}

export function clearStoredToken(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('didhub_jwt');
    }
  } catch {}
}

export function hasAuthToken(): boolean {
  return getStoredToken() !== null;
}

export function readCsrfToken(): string | null {
  try {
    if (typeof document === 'undefined' || typeof document.cookie !== 'string') {
      return null;
    }
    const match = document.cookie.match('(^|;)\\s*csrf_token=([^;]+)');
    return match && match.length >= 3 ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}
