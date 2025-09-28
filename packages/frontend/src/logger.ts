interface BrowserLoggerOptions {
  level?: string;
  allowRuntimeOverride?: boolean;
}
const LEVEL_ORDER: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
function chooseBrowserLevel(base: string, opts: BrowserLoggerOptions) {
  if (typeof window === 'undefined') return base;
  const allow =
    opts.allowRuntimeOverride &&
    typeof process !== 'undefined' &&
    (process as any).env &&
    (process as any).env.NODE_ENV === 'debug';
  if (!allow) return base;
  try {
    const params = new URLSearchParams(window.location.search);
    for (const k of ['log', 'log_level']) {
      const v = params.get(k);
      if (v && LEVEL_ORDER[v.toLowerCase()]) return v.toLowerCase();
    }
  } catch {}
  try {
    for (const k of ['LOG_LEVEL', 'log_level']) {
      const v = window.localStorage.getItem(k);
      if (v && LEVEL_ORDER[v.toLowerCase()]) return v.toLowerCase();
    }
  } catch {}
  return base;
}
function createBrowserLogger(prefix = 'app', options: BrowserLoggerOptions = {}) {
  const base = (options.level || 'info').toLowerCase();
  const level = chooseBrowserLevel(base, options);
  const threshold = LEVEL_ORDER[level] ?? LEVEL_ORDER.info;
  const p = prefix ? `[${prefix}]` : '';
  const pass = (lvl: string) => (LEVEL_ORDER[lvl] ?? 99) <= threshold;
  return {
    error: (...args: any[]) => pass('error') && console.error(p, ...args),
    warn: (...args: any[]) => pass('warn') && console.warn(p, ...args),
    info: (...args: any[]) => pass('info') && console.info(p, ...args),
    debug: (...args: any[]) => pass('debug') && console.debug(p, ...args),
  };
}

// Base level: debug in dev, info otherwise. Allow runtime override only for debug builds.
const baseLevel = import.meta.env.DEV ? 'debug' : 'info';
const allowRuntimeOverride = import.meta.env.MODE === 'debug';

const logger = createBrowserLogger('frontend', {
  level: baseLevel,
  allowRuntimeOverride,
});

export default logger;
