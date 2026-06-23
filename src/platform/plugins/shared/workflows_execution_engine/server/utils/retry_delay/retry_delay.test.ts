/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { computeRetryDelayMs } from './retry_delay';

describe('computeRetryDelayMs', () => {
  describe('fixed strategy', () => {
    it('returns 0 when delay is not configured', () => {
      expect(computeRetryDelayMs({}, 0)).toBe(0);
      expect(computeRetryDelayMs({ strategy: 'fixed' }, 0)).toBe(0);
      expect(computeRetryDelayMs({ strategy: 'fixed', delay: undefined }, 1)).toBe(0);
    });

    it('returns parsed delay in ms regardless of attempt', () => {
      expect(computeRetryDelayMs({ delay: '1s' }, 0)).toBe(1000);
      expect(computeRetryDelayMs({ delay: '1s' }, 1)).toBe(1000);
      expect(computeRetryDelayMs({ delay: '5s' }, 2)).toBe(5000);
      expect(computeRetryDelayMs({ delay: '100ms' }, 0)).toBe(100);
    });

    it('uses fixed strategy when strategy is explicit', () => {
      expect(computeRetryDelayMs({ delay: '1s', strategy: 'fixed', multiplier: 10 }, 2)).toBe(1000);
    });

    it('applies jitter when jitter is true (result in [delay/2, delay])', () => {
      const results = new Set<number>();
      for (let i = 0; i < 50; i++) {
        const ms = computeRetryDelayMs({ delay: '1s', jitter: true }, 0);
        results.add(ms);
        expect(ms).toBeGreaterThanOrEqual(500);
        expect(ms).toBeLessThanOrEqual(1000);
      }
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('exponential strategy', () => {
    it('uses default initial delay 1s when delay not set', () => {
      expect(computeRetryDelayMs({ strategy: 'exponential' }, 0)).toBe(1000);
      expect(computeRetryDelayMs({ strategy: 'exponential' }, 1)).toBe(2000);
      expect(computeRetryDelayMs({ strategy: 'exponential' }, 2)).toBe(4000);
    });

    it('doubles delay each attempt with default multiplier 2', () => {
      expect(computeRetryDelayMs({ delay: '1s', strategy: 'exponential' }, 0)).toBe(1000);
      expect(computeRetryDelayMs({ delay: '1s', strategy: 'exponential' }, 1)).toBe(2000);
      expect(computeRetryDelayMs({ delay: '1s', strategy: 'exponential' }, 2)).toBe(4000);
      expect(computeRetryDelayMs({ delay: '1s', strategy: 'exponential' }, 3)).toBe(8000);
    });

    it('respects custom multiplier', () => {
      expect(computeRetryDelayMs({ delay: '1s', strategy: 'exponential', multiplier: 3 }, 0)).toBe(
        1000
      );
      expect(computeRetryDelayMs({ delay: '1s', strategy: 'exponential', multiplier: 3 }, 1)).toBe(
        3000
      );
      expect(computeRetryDelayMs({ delay: '1s', strategy: 'exponential', multiplier: 3 }, 2)).toBe(
        9000
      );
    });

    it('caps delay at max-delay when set', () => {
      expect(
        computeRetryDelayMs(
          {
            delay: '1s',
            strategy: 'exponential',
            'max-delay': '5s',
          },
          0
        )
      ).toBe(1000);
      expect(
        computeRetryDelayMs(
          {
            delay: '1s',
            strategy: 'exponential',
            'max-delay': '5s',
          },
          1
        )
      ).toBe(2000);
      expect(
        computeRetryDelayMs(
          {
            delay: '1s',
            strategy: 'exponential',
            'max-delay': '5s',
          },
          2
        )
      ).toBe(4000);
      expect(
        computeRetryDelayMs(
          {
            delay: '1s',
            strategy: 'exponential',
            'max-delay': '5s',
          },
          3
        )
      ).toBe(5000);
      expect(
        computeRetryDelayMs(
          {
            delay: '1s',
            strategy: 'exponential',
            'max-delay': '5s',
          },
          10
        )
      ).toBe(5000);
    });

    it('applies jitter when jitter is true (result in [capped/2, capped])', () => {
      for (let i = 0; i < 30; i++) {
        const ms = computeRetryDelayMs(
          {
            delay: '1s',
            strategy: 'exponential',
            'max-delay': '5s',
            jitter: true,
          },
          2
        );
        expect(ms).toBeGreaterThanOrEqual(2000);
        expect(ms).toBeLessThanOrEqual(4000);
      }
    });
  });
});
