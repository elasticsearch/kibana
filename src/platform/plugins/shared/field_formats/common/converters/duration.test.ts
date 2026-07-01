/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DurationFormat, convertDurationValue } from './duration';
import { expectReactElementWithNull, expectReactElementAsArray } from '../test_utils';

describe('convertDurationValue', () => {
  test('returns the value unchanged when units match', () => {
    expect(convertDurationValue(1000, 'milliseconds', 'milliseconds')).toBe(1000);
  });

  test('converts milliseconds to seconds', () => {
    expect(convertDurationValue(1000, 'milliseconds', 'seconds')).toBe(1);
  });

  test('converts seconds to milliseconds', () => {
    expect(convertDurationValue(1, 'seconds', 'milliseconds')).toBe(1000);
  });

  test('converts minutes to seconds', () => {
    expect(convertDurationValue(2, 'minutes', 'seconds')).toBe(120);
  });

  test('supports sub-second input units', () => {
    expect(convertDurationValue(1, 'milliseconds', 'microseconds')).toBeCloseTo(1000);
    expect(convertDurationValue(1_000_000, 'microseconds', 'seconds')).toBeCloseTo(1);
  });
});

describe('Duration Format', () => {
  test('handles missing values', () => {
    const duration = new DurationFormat(
      {
        inputFormat: 'seconds',
        outputFormat: 'humanize',
      },
      jest.fn()
    );
    expect(duration.convertToText(null)).toBe('(null)');
    expect(duration.convertToText(undefined)).toBe('(null)');
    expectReactElementWithNull(duration.convertToReact(null));
    expectReactElementWithNull(duration.convertToReact(undefined));
  });

  test('returns a plain string for a numeric duration', () => {
    const formatter = new DurationFormat(
      { inputFormat: 'seconds', outputFormat: 'humanize' },
      jest.fn()
    );

    expect(formatter.convertToText(60)).toBe('a minute');
    expect(formatter.convertToReact(60)).toBe('a minute');
  });

  test('wraps a multi-value array with bracket notation', () => {
    const formatter = new DurationFormat(
      { inputFormat: 'seconds', outputFormat: 'humanize' },
      jest.fn()
    );

    expect(formatter.convertToText([60, 3600])).toBe('["a minute","an hour"]');
    expectReactElementAsArray(formatter.convertToReact([60, 3600]), ['a minute', 'an hour']);
  });

  test('returns the single element without brackets for a one-element array', () => {
    const formatter = new DurationFormat(
      { inputFormat: 'seconds', outputFormat: 'humanize' },
      jest.fn()
    );

    expect(formatter.convertToText([60])).toBe('["a minute"]');
    expect(formatter.convertToReact([60])).toBe('a minute');
  });

  testCase({
    inputFormat: 'seconds',
    outputFormat: 'humanize',
    outputPrecision: undefined,
    showSuffix: undefined,
    fixtures: [
      {
        input: 0,
        output: '0 seconds',
      },
      {
        input: -60,
        output: 'minus a minute',
      },
      {
        input: 1,
        output: 'a few seconds',
      },
      {
        input: 60,
        output: 'a minute',
      },
      {
        input: 125,
        output: '2 minutes',
      },
      {
        input: null,
        output: '(null)',
      },
      {
        input: undefined,
        output: '(null)',
      },
    ],
  });

  testCase({
    inputFormat: 'minutes',
    outputFormat: 'humanize',
    outputPrecision: undefined,
    showSuffix: undefined,
    fixtures: [
      {
        input: -60,
        output: 'minus an hour',
      },
      {
        input: 60,
        output: 'an hour',
      },
      {
        input: 125,
        output: '2 hours',
      },
    ],
  });

  testCase({
    inputFormat: 'minutes',
    outputFormat: 'asHours',
    outputPrecision: undefined,
    showSuffix: undefined,
    fixtures: [
      {
        input: -60,
        output: '-1.00',
      },
      {
        input: 60,
        output: '1.00',
      },
      {
        input: 125,
        output: '2.08',
      },
    ],
  });

  testCase({
    inputFormat: 'seconds',
    outputFormat: 'asSeconds',
    outputPrecision: 0,
    showSuffix: undefined,
    fixtures: [
      {
        input: -60,
        output: '-60',
      },
      {
        input: 60,
        output: '60',
      },
      {
        input: 125,
        output: '125',
      },
    ],
  });

  testCase({
    inputFormat: 'seconds',
    outputFormat: 'asSeconds',
    outputPrecision: 2,
    showSuffix: undefined,
    fixtures: [
      {
        input: -60,
        output: '-60.00',
      },
      {
        input: -32.333,
        output: '-32.33',
      },
      {
        input: 60,
        output: '60.00',
      },
      {
        input: 125,
        output: '125.00',
      },
    ],
  });

  testCase({
    inputFormat: 'seconds',
    outputFormat: 'asSeconds',
    outputPrecision: 0,
    showSuffix: true,
    fixtures: [
      {
        input: -60,
        output: '-60 seconds',
      },
      {
        input: -32.333,
        output: '-32 seconds',
      },
    ],
  });

  testCase({
    inputFormat: 'nanoseconds',
    outputFormat: 'humanizePrecise',
    outputPrecision: 2,
    showSuffix: true,
    fixtures: [
      {
        input: 1988,
        output: '0.00 milliseconds',
      },
      {
        input: 658,
        output: '0.00 milliseconds',
      },
      {
        input: 3857,
        output: '0.00 milliseconds',
      },
    ],
  });

  testCase({
    inputFormat: 'microseconds',
    outputFormat: 'humanizePrecise',
    outputPrecision: 2,
    showSuffix: true,
    fixtures: [
      {
        input: 1988,
        output: '1.99 milliseconds',
      },
      {
        input: 658,
        output: '0.66 milliseconds',
      },
      {
        input: 3857,
        output: '3.86 milliseconds',
      },
    ],
  });

  testCase({
    inputFormat: 'microseconds',
    outputFormat: 'humanizePrecise',
    outputPrecision: 1,
    showSuffix: true,
    fixtures: [
      {
        input: 1988,
        output: '2.0 milliseconds',
      },
      {
        input: 0,
        output: '0.0 milliseconds',
      },
      {
        input: 658,
        output: '0.7 milliseconds',
      },
      {
        input: 3857,
        output: '3.9 milliseconds',
      },
    ],
  });

  testCase({
    inputFormat: 'seconds',
    outputFormat: 'humanizePrecise',
    outputPrecision: 0,
    showSuffix: true,
    fixtures: [
      {
        input: 0.1,
        output: '100 milliseconds',
      },
      {
        input: 600,
        output: '10 minutes',
      },
      {
        input: 30,
        output: '30 seconds',
      },
      {
        input: 3000,
        output: '50 minutes',
      },
    ],
  });

  testCase({
    inputFormat: 'seconds',
    outputFormat: 'humanizePrecise',
    outputPrecision: 2,
    showSuffix: true,
    useShortSuffix: false,
    fixtures: [
      {
        input: -12,
        output: '-12.00 seconds',
      },
      {
        input: -123,
        output: '-2.05 minutes',
      },
      {
        input: 1,
        output: '1.00 seconds',
      },
      {
        input: 12,
        output: '12.00 seconds',
      },
      {
        input: 123,
        output: '2.05 minutes',
      },
      {
        input: 658,
        output: '10.97 minutes',
      },
      {
        input: 1988,
        output: '33.13 minutes',
      },
      {
        input: 3857,
        output: '1.07 hours',
      },
      {
        input: 123292,
        output: '1.43 days',
      },
      {
        input: 923528271,
        output: '29.28 years',
      },
    ],
  });

  testCase({
    inputFormat: 'milliseconds',
    outputFormat: 'humanizePrecise',
    outputPrecision: 0,
    showSuffix: true,
    useShortSuffix: true,
    fixtures: [
      {
        input: -123,
        output: '-123 ms',
      },
      {
        input: -1230,
        output: '-1 s',
      },
      {
        input: 1,
        output: '1 ms',
      },
      {
        input: 600,
        output: '600 ms',
      },
      {
        input: 30,
        output: '30 ms',
      },
      {
        input: 3000,
        output: '3 s',
      },
      {
        input: 300000,
        output: '5 min',
      },
      {
        input: 30000000,
        output: '8 h',
      },
      {
        input: 90000000,
        output: '1 d',
      },
      {
        input: 9000000000,
        output: '3 mon',
      },
      {
        input: 99999999999,
        output: '3 y',
      },
    ],
  });

  testCase({
    inputFormat: 'milliseconds',
    outputFormat: 'humanizePrecise',
    outputPrecision: 2,
    showSuffix: true,
    useShortSuffix: true,
    fixtures: [
      {
        input: 0.5,
        output: '0.50 ms',
      },
      {
        input: -123.5,
        output: '-123.50 ms',
      },
      {
        input: -123,
        output: '-123.00 ms',
      },
      {
        input: 1,
        output: '1.00 ms',
      },
      {
        input: 600,
        output: '600.00 ms',
      },
      {
        input: 30,
        output: '30.00 ms',
      },
      {
        input: 3000,
        output: '3.00 s',
      },
      {
        input: 300000,
        output: '5.00 min',
      },
      {
        input: 30000000,
        output: '8.33 h',
      },
      {
        input: 90000000,
        output: '1.04 d',
      },
      {
        input: 9000000000,
        output: '3.47 mon',
      },
      {
        input: 99999999999,
        output: '3.17 y',
      },
    ],
  });

  testCase({
    inputFormat: 'seconds',
    outputFormat: 'humanizePrecise',
    outputPrecision: 2,
    showSuffix: true,
    fixtures: [
      {
        input: 0.5,
        output: '500.00 milliseconds',
      },
      {
        input: 600,
        output: '10.00 minutes',
      },
      {
        input: 30,
        output: '30.00 seconds',
      },
      {
        input: 3000,
        output: '50.00 minutes',
      },
      {
        input: 604800,
        output: '1.00 weeks',
      },
      // 1 week and 3 and a half days
      {
        input: 907200,
        output: '1.50 weeks',
      },
      {
        input: 691200,
        output: '1.14 weeks',
      },
    ],
  });

  testCase({
    inputFormat: 'hours',
    outputFormat: 'humanizePrecise',
    outputPrecision: 0,
    showSuffix: true,
    useShortSuffix: true,
    fixtures: [
      {
        input: 0.5,
        output: '30 min',
      },
      {
        input: 339,
        output: '2 w',
      },
    ],
  });

  testCase({
    inputFormat: 'hours',
    outputFormat: 'humanizePrecise',
    outputPrecision: 2,
    showSuffix: true,
    useShortSuffix: true,
    fixtures: [
      {
        input: 0.1,
        output: '6.00 min',
      },
      {
        input: 12,
        output: '12.00 h',
      },
      {
        input: 24,
        output: '1.00 d',
      },
      {
        input: 339,
        output: '2.02 w',
      },
      {
        input: 500,
        output: '2.98 w',
      },
      {
        input: 1000,
        output: '1.39 mon',
      },
    ],
  });

  testCase({
    inputFormat: 'minutes',
    outputFormat: 'humanizePrecise',
    outputPrecision: 2,
    showSuffix: false,
    useShortSuffix: false,
    fixtures: [
      {
        input: 0.1,
        output: '6.00 seconds',
      },
      {
        input: 100.1,
        output: '1.67 hours',
      },
      {
        input: 10750,
        output: '1.07 weeks',
      },
    ],
  });

  testCase({
    inputFormat: 'milliseconds',
    outputFormat: 'humanizePrecise',
    outputPrecision: 0,
    showSuffix: true,
    useShortSuffix: true,
    includeSpaceWithSuffix: false,
    fixtures: [
      {
        input: 0.5,
        output: '1ms',
      },
      {
        input: -123,
        output: '-123ms',
      },
      {
        input: 1,
        output: '1ms',
      },
      {
        input: 600,
        output: '600ms',
      },
    ],
  });

  function testCase({
    inputFormat,
    outputFormat,
    outputPrecision,
    showSuffix,
    useShortSuffix,
    includeSpaceWithSuffix,
    fixtures,
  }: {
    inputFormat: string;
    outputFormat: string;
    outputPrecision: number | undefined;
    showSuffix: boolean | undefined;
    useShortSuffix?: boolean;
    includeSpaceWithSuffix?: boolean;
    fixtures: Array<{ input: number | null | undefined; output: string }>;
  }) {
    fixtures.forEach((fixture: { input: number | null | undefined; output: string }) => {
      const input = fixture.input;
      const output = fixture.output;

      test(`should format ${input} ${inputFormat} through ${outputFormat}${
        outputPrecision ? `, ${outputPrecision} decimals` : ''
      }`, () => {
        const duration = new DurationFormat(
          {
            inputFormat,
            outputFormat,
            outputPrecision,
            showSuffix,
            useShortSuffix,
            includeSpaceWithSuffix,
          },
          jest.fn()
        );
        expect(duration.convertToText(input)).toBe(output);

        if (output === '(null)') {
          expectReactElementWithNull(duration.convertToReact(input));
        } else {
          expect(duration.convertToReact(input)).toBe(output);
        }
      });
    });
  }
});
