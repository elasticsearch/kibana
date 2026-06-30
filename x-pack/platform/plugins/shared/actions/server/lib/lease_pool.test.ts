/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LeasePool, IDLE_TIMEOUT_MS } from './lease_pool';

const noopTerminate = jest.fn().mockResolvedValue(undefined);

const makeFakePerf = () => {
  let perfNow = 1;
  jest.spyOn(performance, 'now').mockImplementation(() => perfNow);

  return {
    tick: (ms: number) => {
      perfNow += ms;
    },
    restore: () => {
      jest.restoreAllMocks();
    },
  };
};

describe('LeasePool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('reuse: N sequential leases on the same key', () => {
    it('calls buildFn exactly once and returns the same client each time', async () => {
      const pool = new LeasePool<string>();
      let callCount = 0;
      const buildFn = async () => {
        callCount++;
        return 'client-a';
      };

      const r1 = await pool.lease('key', buildFn, noopTerminate);
      const r2 = await pool.lease('key', buildFn, noopTerminate);
      const r3 = await pool.lease('key', buildFn, noopTerminate);

      expect(callCount).toBe(1);
      expect(r1).toBe('client-a');
      expect(r2).toBe('client-a');
      expect(r3).toBe('client-a');
    });
  });

  describe('anti-stampede: M concurrent cold callers on the same key', () => {
    it('calls buildFn exactly once even when all callers arrive before the build resolves', async () => {
      const pool = new LeasePool<string>();
      let callCount = 0;
      let resolve!: (v: string) => void;
      const buildPromise = new Promise<string>((res) => {
        resolve = res;
      });
      const buildFn = async () => {
        callCount++;
        return buildPromise;
      };

      const leases = [
        pool.lease('key', buildFn, noopTerminate),
        pool.lease('key', buildFn, noopTerminate),
        pool.lease('key', buildFn, noopTerminate),
      ];

      resolve('client-b');
      const results = await Promise.all(leases);

      expect(callCount).toBe(1);
      expect(results).toEqual(['client-b', 'client-b', 'client-b']);
    });
  });

  describe('evict-on-reject', () => {
    it('removes the key when the build rejects so the next lease rebuilds', async () => {
      const pool = new LeasePool<string>();
      let callCount = 0;
      const buildFn = jest.fn().mockImplementationOnce(async () => {
        callCount++;
        throw new Error('build failed');
      });
      buildFn.mockImplementationOnce(async () => {
        callCount++;
        return 'client-c';
      });

      await expect(pool.lease('key', buildFn, noopTerminate)).rejects.toThrow('build failed');

      const result = await pool.lease('key', buildFn, noopTerminate);
      expect(result).toBe('client-c');
      expect(callCount).toBe(2);
    });

    it('propagates the rejection to callers waiting on the same in-flight build', async () => {
      const pool = new LeasePool<string>();
      let reject!: (e: Error) => void;
      const buildPromise = new Promise<string>((_, rej) => {
        reject = rej;
      });
      const buildFn = async () => buildPromise;

      const p1 = pool.lease('key', buildFn, noopTerminate);
      const p2 = pool.lease('key', buildFn, noopTerminate);

      reject(new Error('concurrent fail'));

      await expect(p1).rejects.toThrow('concurrent fail');
      await expect(p2).rejects.toThrow('concurrent fail');
    });
  });

  describe('isolation: distinct keys', () => {
    it('calls buildFn independently for different keys', async () => {
      const pool = new LeasePool<string>();
      let aCount = 0;
      let bCount = 0;

      const clientA = await pool.lease(
        'key-a',
        async () => {
          aCount++;
          return 'client-a';
        },
        noopTerminate
      );
      const clientB = await pool.lease(
        'key-b',
        async () => {
          bCount++;
          return 'client-b';
        },
        noopTerminate
      );

      expect(aCount).toBe(1);
      expect(bCount).toBe(1);
      expect(clientA).toBe('client-a');
      expect(clientB).toBe('client-b');
    });
  });

  describe('updateAgeOnGet: re-lease before expiry survives', () => {
    let perf: ReturnType<typeof makeFakePerf>;

    beforeEach(() => {
      perf = makeFakePerf();
    });

    afterEach(() => {
      perf.restore();
    });

    it('does not expire an entry re-leased just before the idle TTL', async () => {
      const pool = new LeasePool<string>();
      const terminateSpy = jest.fn().mockResolvedValue(undefined);

      await pool.lease('conn:mcp:shared', async () => 'client', terminateSpy);

      perf.tick(IDLE_TIMEOUT_MS - 1000);
      await pool.lease('conn:mcp:shared', async () => 'client', terminateSpy);

      perf.tick(IDLE_TIMEOUT_MS);
      await Promise.resolve();

      expect(terminateSpy).not.toHaveBeenCalled();
    });
  });

  describe('evict(connectorId)', () => {
    it('calls terminate on matching-prefix resolved entries and removes them', async () => {
      const pool = new LeasePool<string>();
      const terminateA = jest.fn().mockResolvedValue(undefined);
      const terminateB = jest.fn().mockResolvedValue(undefined);

      await pool.lease('conn-a:mcp:shared', async () => 'client-a', terminateA);
      await pool.lease('conn-b:mcp:shared', async () => 'client-b', terminateB);

      pool.evict('conn-a');

      await Promise.resolve();

      expect(terminateA).toHaveBeenCalledWith('client-a');
      expect(terminateB).not.toHaveBeenCalled();
    });

    it('removes the entry whether terminate resolves or rejects (best-effort)', async () => {
      const pool = new LeasePool<string>();
      const terminateFailing = jest.fn().mockRejectedValue(new Error('terminate failed'));

      await pool.lease('conn-x:mcp:shared', async () => 'client-x', terminateFailing);

      pool.evict('conn-x');
      await Promise.resolve();

      let buildCount = 0;
      await pool.lease(
        'conn-x:mcp:shared',
        async () => {
          buildCount++;
          return 'client-x2';
        },
        noopTerminate
      );

      expect(buildCount).toBe(1);
    });

    it('terminates after resolve when evicting an in-progress entry', async () => {
      const pool = new LeasePool<string>();
      let resolveClient!: (v: string) => void;
      const inFlight = new Promise<string>((res) => {
        resolveClient = res;
      });
      const terminateSpy = jest.fn().mockResolvedValue(undefined);

      const leasePromise = pool.lease('conn-y:mcp:shared', async () => inFlight, terminateSpy);

      pool.evict('conn-y');
      await Promise.resolve();

      expect(terminateSpy).not.toHaveBeenCalled();

      resolveClient('client-y');
      await leasePromise;
      await Promise.resolve();

      expect(terminateSpy).toHaveBeenCalledTimes(1);
      expect(terminateSpy).toHaveBeenCalledWith('client-y');
    });

    it('does not terminate when evicting an entry whose build rejects', async () => {
      const pool = new LeasePool<string>();
      let rejectClient!: (e: Error) => void;
      const inFlight = new Promise<string>((_, rej) => {
        rejectClient = rej;
      });
      const terminateSpy = jest.fn().mockResolvedValue(undefined);

      const leasePromise = pool.lease('conn-z:mcp:shared', async () => inFlight, terminateSpy);

      pool.evict('conn-z');
      await Promise.resolve();

      rejectClient(new Error('build failed'));
      await expect(leasePromise).rejects.toThrow('build failed');
      await Promise.resolve();

      expect(terminateSpy).not.toHaveBeenCalled();
    });

    it('does not touch entries for a different connector', async () => {
      const pool = new LeasePool<string>();
      const terminateOther = jest.fn().mockResolvedValue(undefined);

      await pool.lease('other-conn:mcp:shared', async () => 'other-client', terminateOther);

      pool.evict('my-conn');
      await Promise.resolve();

      expect(terminateOther).not.toHaveBeenCalled();
    });
  });

  describe('idle expiry', () => {
    let perf: ReturnType<typeof makeFakePerf>;

    beforeEach(() => {
      perf = makeFakePerf();
    });

    afterEach(() => {
      perf.restore();
    });

    it('expires an idle entry after IDLE_TIMEOUT_MS', async () => {
      const pool = new LeasePool<string>();
      const terminateSpy = jest.fn().mockResolvedValue(undefined);

      await pool.lease('conn:mcp:shared', async () => 'client', terminateSpy);

      perf.tick(IDLE_TIMEOUT_MS + 1);

      let buildCount = 0;
      const client2 = await pool.lease(
        'conn:mcp:shared',
        async () => {
          buildCount++;
          return 'client2';
        },
        noopTerminate
      );
      await Promise.resolve();

      expect(terminateSpy).toHaveBeenCalledWith('client');
      expect(buildCount).toBe(1);
      expect(client2).toBe('client2');
    });
  });

  describe('stop()', () => {
    it('fire-and-forgets terminate on all resolved entries', async () => {
      const pool = new LeasePool<string>();
      const terminateA = jest.fn().mockResolvedValue(undefined);
      const terminateB = jest.fn().mockResolvedValue(undefined);

      await pool.lease('conn-a:mcp:shared', async () => 'client-a', terminateA);
      await pool.lease('conn-b:mcp:shared', async () => 'client-b', terminateB);

      pool.stop();

      await Promise.resolve();

      expect(terminateA).toHaveBeenCalledWith('client-a');
      expect(terminateB).toHaveBeenCalledWith('client-b');
    });

    it('returns synchronously (does not await terminate)', () => {
      const pool = new LeasePool<string>();

      expect(() => pool.stop()).not.toThrow();
    });

    it('terminates after resolve when stopping with an in-progress entry', async () => {
      const pool = new LeasePool<string>();
      let resolveClient!: (v: string) => void;
      const inFlight = new Promise<string>((res) => {
        resolveClient = res;
      });
      const terminateSpy = jest.fn().mockResolvedValue(undefined);

      const leasePromise = pool.lease('conn:mcp:shared', async () => inFlight, terminateSpy);

      pool.stop();

      expect(terminateSpy).not.toHaveBeenCalled();

      resolveClient('client');
      await leasePromise;
      await Promise.resolve();

      expect(terminateSpy).toHaveBeenCalledTimes(1);
      expect(terminateSpy).toHaveBeenCalledWith('client');
    });

    it('does not terminate when stopping with an entry whose build rejects', async () => {
      const pool = new LeasePool<string>();
      let rejectClient!: (e: Error) => void;
      const inFlight = new Promise<string>((_, rej) => {
        rejectClient = rej;
      });
      const terminateSpy = jest.fn().mockResolvedValue(undefined);

      const leasePromise = pool.lease('conn:mcp:shared', async () => inFlight, terminateSpy);

      pool.stop();

      rejectClient(new Error('build failed'));
      await expect(leasePromise).rejects.toThrow('build failed');
      await Promise.resolve();

      expect(terminateSpy).not.toHaveBeenCalled();
    });

    it('empties the cache', async () => {
      const pool = new LeasePool<string>();

      await pool.lease('conn:mcp:shared', async () => 'client', noopTerminate);

      pool.stop();

      let buildCount = 0;
      await pool.lease(
        'conn:mcp:shared',
        async () => {
          buildCount++;
          return 'client2';
        },
        noopTerminate
      );
      expect(buildCount).toBe(1);
    });
  });
});
