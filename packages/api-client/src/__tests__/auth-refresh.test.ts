import { setStoredToken, getTokenExp, refreshToken } from '../Util';
import { describe, it, expect } from 'vitest';

// NOTE: This is a light test using a fake token; it only validates decoding & basic failure path of refresh (since no server in unit env).

describe('auth refresh utilities', () => {
  it('decodes exp from JWT', () => {
    // header {"alg":"HS256","typ":"JWT"} -> eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
    const future = Math.floor(Date.now() / 1000) + 3600;
    const payload = btoa(JSON.stringify({ sub: 'u', exp: future }));
    const fake = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + payload + '.signature';
    expect(getTokenExp(fake)).toBe(future);
  });

  it('refreshToken returns ok:false without stored token', async () => {
    // Ensure cleared
    try {
      localStorage.removeItem('didhub_jwt');
    } catch {}
    const r = await refreshToken();
    expect(r.ok).toBe(false);
  });
});
