/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createStreamingContentRestorer,
  restoreTokenizedString,
  restoreTokenizedValue,
  type InferenceTokenMap,
} from './workflow_anonymization_restoration';

const token = 'EMAIL_0123456789abcdef0123456789abcdef';
const tokenMap: InferenceTokenMap = {
  [token]: { original: 'person@example.com', entityClass: 'EMAIL' },
};

describe('workflow anonymization restoration', () => {
  it('restores complete tokens and nested structured values', () => {
    expect(restoreTokenizedString(`Contact ${token}`, tokenMap)).toBe('Contact person@example.com');
    expect(
      restoreTokenizedValue(
        { recipients: [token], encoded: JSON.stringify({ email: token }) },
        tokenMap
      )
    ).toEqual({
      recipients: ['person@example.com'],
      encoded: JSON.stringify({ email: 'person@example.com' }),
    });
  });

  it('holds a token split across chunks until it can be restored safely', () => {
    const restorer = createStreamingContentRestorer(tokenMap);

    expect(restorer.push(`Contact ${token.slice(0, 12)}`)).toBe('Contact ');
    expect(restorer.push(`${token.slice(12)} now`)).toBe('person@example.com now');
    expect(restorer.flush()).toBe('');
  });

  it('does not hold back a single-character token prefix to avoid gaps on common letters', () => {
    // MIN_PREFIX_HOLDBACK = 2: tokens split at their very first character are emitted immediately
    // rather than causing streaming gaps on single letters like 'E' (EMAIL) or 'I' (IP).
    // Accepted tradeoff: restoration does not happen when the token is split at position 1.
    const restorer = createStreamingContentRestorer(tokenMap);
    const first = restorer.push(`Contact ${token.slice(0, 1)}`);
    const second = restorer.push(`${token.slice(1)} now`);

    expect(first).toBe(`Contact ${token.slice(0, 1)}`);
    // The two halves are processed as separate chunks, so the token is not restored.
    expect(`${first}${second}${restorer.flush()}`).toBe(`Contact ${token} now`);
  });

  for (const splitAt of Array.from({ length: token.length - 2 }, (_, index) => index + 2)) {
    it(`restores a token split at character ${splitAt} without emitting its prefix`, () => {
      const restorer = createStreamingContentRestorer(tokenMap);
      const first = restorer.push(`Contact ${token.slice(0, splitAt)}`);
      const second = restorer.push(`${token.slice(splitAt)} now`);

      expect(first).toBe('Contact ');
      expect(`${first}${second}${restorer.flush()}`).toBe('Contact person@example.com now');
    });
  }

  it('restores a complete token at a chunk boundary without delaying it', () => {
    const restorer = createStreamingContentRestorer(tokenMap);

    expect(restorer.push(token)).toBe('person@example.com');
    expect(restorer.flush()).toBe('');
  });

  it('does not delay unrelated uppercase text that merely resembles a token', () => {
    const restorer = createStreamingContentRestorer(tokenMap);

    expect(restorer.push('Status EMAIL_PENDING')).toBe('Status EMAIL_PENDING');
    expect(restorer.flush()).toBe('');
  });

  it('flushes an incomplete token-shaped suffix without dropping content', () => {
    const restorer = createStreamingContentRestorer(tokenMap);

    expect(restorer.push('Value EMAIL_0123')).toBe('Value ');
    expect(restorer.flush()).toBe('EMAIL_0123');
  });
});
