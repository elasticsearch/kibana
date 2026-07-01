/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TimeDuration, getTimeDurationUnit } from './time_duration';

describe('TimeDuration', () => {
  describe('fromMilliseconds', () => {
    it.each([
      [5000, new TimeDuration(5, 's')],
      [600000, new TimeDuration(10, 'm')],
      [25200000, new TimeDuration(7, 'h')],
      [777600000, new TimeDuration(9, 'd')],
      [-3000, new TimeDuration(-3, 's')],
      [-300000, new TimeDuration(-5, 'm')],
      [-18000000, new TimeDuration(-5, 'h')],
      [-604800000, new TimeDuration(-7, 'd')],
    ])('parses "%s"', (ms, expectedTimeDuration) => {
      const result = TimeDuration.fromMilliseconds(ms);

      expect(result).toEqual(expectedTimeDuration);
    });

    it.each([
      [360000, 's', new TimeDuration(360, 's')],
      [360000, 'm', new TimeDuration(6, 'm')],
      [7200000, 'h', new TimeDuration(2, 'h')],
      // Falls back to normalization when not a whole number of the preferred unit
      [150000, 'm', new TimeDuration(150, 's')],
      // The preferred unit is ignored for zero so it stays "0s"
      [0, 'm', new TimeDuration(0, 's')],
    ] as const)(
      'parses "%s" preserving preferred unit "%s"',
      (ms, preferredUnit, expectedTimeDuration) => {
        const result = TimeDuration.fromMilliseconds(ms, preferredUnit);

        expect(result).toEqual(expectedTimeDuration);
      }
    );
  });

  describe('getTimeDurationUnit', () => {
    it.each([
      ['360s', 's'],
      ['6m', 'm'],
      ['7h', 'h'],
      ['9d', 'd'],
      ['now-360s', 's'],
      ['now-11m', 'm'],
      ['now-2h', 'h'],
    ] as const)('extracts unit from "%s"', (input, expectedUnit) => {
      expect(getTimeDurationUnit(input)).toBe(expectedUnit);
    });

    it.each([['now'], ['']])('returns "undefined" for "%s"', (input) => {
      expect(getTimeDurationUnit(input)).toBeUndefined();
    });
  });

  describe('parse', () => {
    it.each([
      ['5s', new TimeDuration(5, 's')],
      ['10m', new TimeDuration(10, 'm')],
      ['7h', new TimeDuration(7, 'h')],
      ['9d', new TimeDuration(9, 'd')],
      ['+5s', new TimeDuration(5, 's')],
      ['+10m', new TimeDuration(10, 'm')],
      ['+7h', new TimeDuration(7, 'h')],
      ['+9d', new TimeDuration(9, 'd')],
      ['-3s', new TimeDuration(-3, 's')],
      ['-5m', new TimeDuration(-5, 'm')],
      ['-5h', new TimeDuration(-5, 'h')],
      ['-7d', new TimeDuration(-7, 'd')],
      ['0s', new TimeDuration(0, 's')],
      ['0m', new TimeDuration(0, 's')],
      ['0h', new TimeDuration(0, 's')],
      ['0d', new TimeDuration(0, 's')],
      ['+0s', new TimeDuration(0, 's')],
      ['+0m', new TimeDuration(0, 's')],
      ['+0h', new TimeDuration(0, 's')],
      ['+0d', new TimeDuration(0, 's')],
      ['-0s', new TimeDuration(0, 's')],
      ['-0m', new TimeDuration(0, 's')],
      ['-0h', new TimeDuration(0, 's')],
      ['-0d', new TimeDuration(0, 's')],
    ])('parses "%s"', (duration, expectedTimeDuration) => {
      const result = TimeDuration.parse(duration);

      expect(result).toEqual(expectedTimeDuration);
    });

    it('does NOT trim leading spaces', () => {
      const result = TimeDuration.parse(' 6m');

      expect(result).toBeUndefined();
    });

    it('does NOT trim trailing spaces', () => {
      const result = TimeDuration.parse('8h ');

      expect(result).toBeUndefined();
    });

    it.each([[''], [' '], ['s'], ['invalid'], ['3ss'], ['m4s'], ['78']])(
      'returns "undefined" when tries to parse invalid duration "%s"',
      (invalidDuration) => {
        const result = TimeDuration.parse(invalidDuration);

        expect(result).toBeUndefined();
      }
    );

    it.each([['1S'], ['2M'], ['3H'], ['4D'], ['5Y'], ['7nanos'], ['8ms']])(
      'returns "undefined" when tries to parse unsupported duration units "%s"',
      (invalidDuration) => {
        const result = TimeDuration.parse(invalidDuration);

        expect(result).toBeUndefined();
      }
    );
  });

  describe('toMilliseconds', () => {
    it.each([
      [new TimeDuration(5, 's'), 5000],
      [new TimeDuration(10, 'm'), 600000],
      [new TimeDuration(7, 'h'), 25200000],
      [new TimeDuration(9, 'd'), 777600000],
      [new TimeDuration(-3, 's'), -3000],
      [new TimeDuration(-5, 'm'), -300000],
      [new TimeDuration(-5, 'h'), -18000000],
      [new TimeDuration(-7, 'd'), -604800000],
    ])('converts %j to %d milliseconds', (timeDuration, expected) => {
      const result = timeDuration.toMilliseconds();

      expect(result).toBe(expected);
    });

    it.each([
      [new TimeDuration(0, 's')],
      [new TimeDuration(0, 'm')],
      [new TimeDuration(0, 'h')],
      [new TimeDuration(0, 'd')],
      [new TimeDuration(-0, 's')],
      [new TimeDuration(-0, 'm')],
      [new TimeDuration(-0, 'h')],
      [new TimeDuration(-0, 'd')],
    ])('converts %j to zero', (timeDuration) => {
      const result = timeDuration.toMilliseconds();

      // Handle negative zero case. Jest treats 0 !== -0.
      expect(`${result}`).toBe('0');
    });

    it.each([
      // @ts-expect-error testing invalid unit
      [new TimeDuration(0, '')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(0, ' ')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(0, 'invalid')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(3, 'ss')],
    ])('returns "undefined" when tries to convert invalid duration %j', (invalidTimeDuration) => {
      const result = invalidTimeDuration.toMilliseconds();

      expect(result).toBeUndefined();
    });

    it.each([
      // @ts-expect-error testing invalid unit
      [new TimeDuration(1, 'S')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(2, 'M')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(3, 'H')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(4, 'D')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(5, 'Y')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(7, 'nanos')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(8, 'ms')],
    ])(
      'returns "undefined" when tries to convert unsupported duration units %j',
      (invalidTimeDuration) => {
        const result = invalidTimeDuration.toMilliseconds();

        expect(result).toBeUndefined();
      }
    );
  });

  describe('toNormalizedTimeDuration', () => {
    it.each([
      [new TimeDuration(5, 's'), new TimeDuration(5, 's')],
      [new TimeDuration(65, 's'), new TimeDuration(65, 's')],
      [new TimeDuration(600, 's'), new TimeDuration(10, 'm')],
      [new TimeDuration(650, 's'), new TimeDuration(650, 's')],
      [new TimeDuration(90, 'm'), new TimeDuration(90, 'm')],
      [new TimeDuration(25200, 's'), new TimeDuration(7, 'h')],
      [new TimeDuration(120, 'm'), new TimeDuration(2, 'h')],
      [new TimeDuration(36, 'h'), new TimeDuration(36, 'h')],
      [new TimeDuration(777600, 's'), new TimeDuration(9, 'd')],
      [new TimeDuration(5184000, 's'), new TimeDuration(60, 'd')],
      [new TimeDuration(1440, 'm'), new TimeDuration(1, 'd')],
      [new TimeDuration(48, 'h'), new TimeDuration(2, 'd')],
      [new TimeDuration(-5, 's'), new TimeDuration(-5, 's')],
      [new TimeDuration(-65, 's'), new TimeDuration(-65, 's')],
      [new TimeDuration(-600, 's'), new TimeDuration(-10, 'm')],
      [new TimeDuration(-650, 's'), new TimeDuration(-650, 's')],
      [new TimeDuration(-90, 'm'), new TimeDuration(-90, 'm')],
      [new TimeDuration(-25200, 's'), new TimeDuration(-7, 'h')],
      [new TimeDuration(-120, 'm'), new TimeDuration(-2, 'h')],
      [new TimeDuration(-36, 'h'), new TimeDuration(-36, 'h')],
      [new TimeDuration(-777600, 's'), new TimeDuration(-9, 'd')],
      [new TimeDuration(-5184000, 's'), new TimeDuration(-60, 'd')],
      [new TimeDuration(-1440, 'm'), new TimeDuration(-1, 'd')],
      [new TimeDuration(-48, 'h'), new TimeDuration(-2, 'd')],
    ])('converts %j to normalized time duration %j', (timeDuration, expected) => {
      const result = timeDuration.toNormalizedTimeDuration();

      expect(result).toEqual(expected);
    });

    it.each([
      [new TimeDuration(0, 's')],
      [new TimeDuration(0, 'm')],
      [new TimeDuration(0, 'h')],
      [new TimeDuration(0, 'd')],
    ])('converts %j to 0s', (timeDuration) => {
      const result = timeDuration.toNormalizedTimeDuration();

      expect(result).toEqual(new TimeDuration(0, 's'));
    });

    it.each([
      // @ts-expect-error testing invalid unit
      [new TimeDuration(1, 'S')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(2, 'M')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(3, 'H')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(4, 'D')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(5, 'Y')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(7, 'nanos')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(8, 'ms')],
      // @ts-expect-error testing invalid unit
      [new TimeDuration(0, 'invalid')],
    ])('returns %j unchanged', (timeDuration) => {
      const result = timeDuration.toNormalizedTimeDuration();

      expect(result).toEqual(timeDuration);
    });
  });
});
