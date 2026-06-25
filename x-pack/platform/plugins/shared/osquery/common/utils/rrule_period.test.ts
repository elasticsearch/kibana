/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { safeDerivePeriodSeconds, derivePeriodSeconds } from './rrule_period';
import { parseRRule } from './rrule_parser';

describe('safeDerivePeriodSeconds', () => {
  test('returns undefined for an unparseable RRULE', () => {
    expect(safeDerivePeriodSeconds('garbage')).toBeUndefined();
  });

  test('returns undefined for RRULE missing FREQ', () => {
    expect(safeDerivePeriodSeconds('BYDAY=MO,WE')).toBeUndefined();
  });

  test('returns undefined for empty string', () => {
    expect(safeDerivePeriodSeconds('')).toBeUndefined();
  });

  test('MINUTELY;INTERVAL=2 → 120s', () => {
    expect(safeDerivePeriodSeconds('FREQ=MINUTELY;INTERVAL=2')).toBe(120);
  });

  test('DAILY → 86400s', () => {
    expect(safeDerivePeriodSeconds('FREQ=DAILY')).toBe(86400);
  });
});

describe('derivePeriodSeconds', () => {
  describe('MINUTELY', () => {
    test('FREQ=MINUTELY → 60s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MINUTELY'))).toBe(60);
    });

    test('FREQ=MINUTELY;INTERVAL=2 → 120s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MINUTELY;INTERVAL=2'))).toBe(120);
    });

    test('FREQ=MINUTELY;INTERVAL=30 → 1800s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MINUTELY;INTERVAL=30'))).toBe(1800);
    });
  });

  describe('HOURLY', () => {
    test('FREQ=HOURLY → 3600s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=HOURLY'))).toBe(3600);
    });

    test('FREQ=HOURLY;INTERVAL=2 → 7200s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=HOURLY;INTERVAL=2'))).toBe(7200);
    });
  });

  describe('DAILY', () => {
    test('FREQ=DAILY → 86400s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=DAILY'))).toBe(86400);
    });

    test('FREQ=DAILY;INTERVAL=3 → 259200s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=DAILY;INTERVAL=3'))).toBe(259200);
    });
  });

  describe('WEEKLY', () => {
    test('FREQ=WEEKLY → 604800s (7 days)', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=WEEKLY'))).toBe(604800);
    });

    test('FREQ=WEEKLY;INTERVAL=2 → 1209600s (14 days)', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=WEEKLY;INTERVAL=2'))).toBe(1209600);
    });

    test('FREQ=WEEKLY;BYDAY=MO → single day → falls through to base 604800s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=WEEKLY;BYDAY=MO'))).toBe(604800);
    });

    test('FREQ=WEEKLY;BYDAY=MO,WE,FR → min cyclic gap 2 days → 172800s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR'))).toBe(172800);
    });

    test('FREQ=WEEKLY;BYDAY=MO,FR → min cyclic gap 3 days (FR→MO wraps) → 259200s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=WEEKLY;BYDAY=MO,FR'))).toBe(259200);
    });

    test('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU → all 7 days → min gap 1 day → 86400s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU'))).toBe(86400);
    });
  });

  describe('MONTHLY', () => {
    test('FREQ=MONTHLY → 28 × 86400s (conservative floor)', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MONTHLY'))).toBe(28 * 86400);
    });

    test('FREQ=MONTHLY;BYMONTHDAY=1 → single day → 28 × 86400s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MONTHLY;BYMONTHDAY=1'))).toBe(28 * 86400);
    });

    test('FREQ=MONTHLY;INTERVAL=3 → 3 × 28 × 86400s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MONTHLY;INTERVAL=3'))).toBe(3 * 28 * 86400);
    });

    test('FREQ=MONTHLY;BYMONTHDAY=1,15 → min cyclic gap 14 days → 1209600s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MONTHLY;BYMONTHDAY=1,15'))).toBe(14 * 86400);
    });

    test('FREQ=MONTHLY;BYMONTHDAY=1,15,28 → min cyclic gap 1 day (28→1 wraps) → 86400s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MONTHLY;BYMONTHDAY=1,15,28'))).toBe(86400);
    });

    test('FREQ=MONTHLY;BYMONTHDAY=10,20 → min cyclic gap 10 days → 864000s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MONTHLY;BYMONTHDAY=10,20'))).toBe(10 * 86400);
    });

    test('FREQ=MONTHLY;BYMONTHDAY=-1 → negative day → falls through to 28 × 86400s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MONTHLY;BYMONTHDAY=-1'))).toBe(28 * 86400);
    });

    test('FREQ=MONTHLY;BYMONTHDAY=1,-1 → mixed sign → falls through to 28 × 86400s', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=MONTHLY;BYMONTHDAY=1,-1'))).toBe(28 * 86400);
    });
  });

  describe('YEARLY', () => {
    test('FREQ=YEARLY → 365 × 86400s (conservative floor, no leap day)', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=YEARLY'))).toBe(365 * 86400);
    });

    test('FREQ=YEARLY;INTERVAL=2 → 2 × 365 × 86400s (INTERVAL folded in)', () => {
      expect(derivePeriodSeconds(parseRRule('FREQ=YEARLY;INTERVAL=2'))).toBe(2 * 365 * 86400);
    });
  });
});
