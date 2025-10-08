import React from 'react';

/**
 * Renders embeddable content like YouTube videos and links
 */
export function renderEmbeds(arr: unknown): React.ReactElement | null {
  if (!arr) return null;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch (e) {
      const s = arr as string;
      arr = s
        .split(',')
        .map((x: string) => x.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(arr)) return React.createElement('div', null, String(arr));
  // Normalize the array: trim strings and filter out empty ones
  const normalized = (arr as string[])
    .map((u: string) => (typeof u === 'string' ? u.trim() : String(u)))
    .filter((u: string) => u.length > 0);
  return React.createElement(
    React.Fragment,
    null,
    normalized.map((u: string, i: number) => {
      const m = u.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
      if (m) {
        return React.createElement('iframe', {
          key: i,
          width: '320',
          height: '180',
          src: `https://www.youtube.com/embed/${m[1]}`,
          title: u,
          style: { margin: '8px 0' },
        });
      }
      return React.createElement(
        'div',
        { key: i },
        React.createElement('a', { href: u, target: '_blank', rel: 'noreferrer' }, u),
      );
    }),
  );
}

/**
 * Normalizes various input formats to a string array
 */
export function normalizeToArray(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw))
    return (raw as any[]).map((s) => (typeof s === 'string' ? s.trim() : String(s))).filter((s) => s.length > 0);
  if (typeof raw === 'string') {
    const s = raw as string;
    if (s.trim() === '') return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed))
        return (parsed as any[]).map((x) => (typeof x === 'string' ? x.trim() : String(x))).filter((x) => x.length > 0);
    } catch (e) {
      // not JSON, fallthrough to comma-split
    }
    if (s.indexOf(',') !== -1)
      return s
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    return [s];
  }
  return [String(raw)];
}
