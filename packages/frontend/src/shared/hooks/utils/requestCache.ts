type Fetcher<T> = () => Promise<T>;

type CacheEntry<T> = {
  ts: number;
  value: T;
};

export class RequestCache {
  private cache: Record<string, CacheEntry<any>> = {};
  private inflight: Record<string, Promise<any>> = {};
  private ttl: number;

  constructor(ttl = 5000) {
    this.ttl = ttl;
  }

  async fetch<T>(key: string, fetcher: Fetcher<T>): Promise<T> {
    const now = Date.now();
    const cached = this.cache[key];
    if (cached && now - cached.ts < this.ttl) return cached.value;

    if (this.inflight[key]) return this.inflight[key];

    const p = (async () => {
      try {
        const v = await fetcher();
        this.cache[key] = { ts: Date.now(), value: v };
        return v;
      } finally {
        delete this.inflight[key];
      }
    })();

    this.inflight[key] = p;
    return p;
  }

  clear(key: string) {
    delete this.cache[key];
  }

  clearAll() {
    this.cache = {};
  }
}

export default RequestCache;
