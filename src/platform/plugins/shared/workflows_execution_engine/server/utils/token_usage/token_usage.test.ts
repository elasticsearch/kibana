/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { extractTokenUsage, sumTokenUsage } from './token_usage';

describe('extractTokenUsage', () => {
  it('extracts usage from output.metadata.usage', () => {
    expect(
      extractTokenUsage({
        message: 'hi',
        metadata: { usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
      })
    ).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it('recomputes totalTokens from input + output (ignores reported total)', () => {
    expect(
      extractTokenUsage({
        metadata: { usage: { inputTokens: 100, outputTokens: 50, totalTokens: 9999 } },
      })
    ).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it('defaults a missing token field to 0 when the other is present', () => {
    expect(extractTokenUsage({ metadata: { usage: { inputTokens: 100 } } })).toEqual({
      inputTokens: 100,
      outputTokens: 0,
      totalTokens: 100,
    });
  });

  it.each([
    ['null output', null],
    ['undefined output', undefined],
    ['primitive output', 'a string'],
    ['no metadata', { message: 'hi' }],
    ['metadata without usage', { metadata: {} }],
    ['usage without numeric fields', { metadata: { usage: {} } }],
    ['non-finite token values', { metadata: { usage: { inputTokens: NaN, outputTokens: NaN } } }],
    [
      'non-number token values',
      { metadata: { usage: { inputTokens: '100', outputTokens: '50' } } },
    ],
  ])('returns undefined for %s', (_label, output) => {
    expect(extractTokenUsage(output)).toBeUndefined();
  });
});

describe('sumTokenUsage', () => {
  it('sums two usage records field by field', () => {
    expect(
      sumTokenUsage(
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        { inputTokens: 200, outputTokens: 80, totalTokens: 280 }
      )
    ).toEqual({ inputTokens: 300, outputTokens: 130, totalTokens: 430 });
  });

  it('returns a fresh copy of the defined operand when the other is undefined', () => {
    const usage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };
    expect(sumTokenUsage(undefined, usage)).toEqual(usage);
    expect(sumTokenUsage(usage, undefined)).toEqual(usage);
    // Never aliases an operand, so the per-execution total and a step's own
    // usage record can never mutate each other.
    expect(sumTokenUsage(undefined, usage)).not.toBe(usage);
    expect(sumTokenUsage(usage, undefined)).not.toBe(usage);
  });

  it('returns undefined when both operands are undefined', () => {
    expect(sumTokenUsage(undefined, undefined)).toBeUndefined();
  });
});
