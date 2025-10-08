import RequestCache from '../requestCache';

describe('RequestCache', () => {
  it('returns cached value within TTL and refetches after TTL', async () => {
    const rc = new RequestCache(100); // short TTL

    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return { v: calls };
    };

    const r1 = await rc.fetch('k', fetcher);
    const r2 = await rc.fetch('k', fetcher);
    expect(r1).toEqual({ v: 1 });
    expect(r2).toEqual({ v: 1 });
    expect(calls).toBe(1);

    // wait for TTL to expire
    await new Promise((r) => setTimeout(r, 150));

    const r3 = await rc.fetch('k', fetcher);
    expect(r3).toEqual({ v: 2 });
    expect(calls).toBe(2);
  });

  it('coalesces concurrent requests', async () => {
    const rc = new RequestCache(1000);
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 50));
      return { v: calls };
    };

    const [a, b] = await Promise.all([rc.fetch('x', fetcher), rc.fetch('x', fetcher)]);
    expect(a).toEqual(b);
    expect(calls).toBe(1);
  });
});
