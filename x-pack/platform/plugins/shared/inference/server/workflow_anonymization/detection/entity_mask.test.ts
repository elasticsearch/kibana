/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { generateEntityToken } from './entity_mask';

describe('generateEntityToken', () => {
  describe('output format', () => {
    it('returns a string of the form <ENTITY_CLASS>_<hex>', () => {
      const token = generateEntityToken('scope', 'EMAIL', 'user@example.com');
      expect(token).toMatch(/^EMAIL_[0-9a-f]+$/);
    });

    it('default hash segment is 32 hex characters', () => {
      const token = generateEntityToken('scope', 'EMAIL', 'user@example.com');
      const hash = token.slice('EMAIL_'.length);
      expect(hash).toHaveLength(32);
    });

    it('hashLength parameter controls the hash segment length', () => {
      const token = generateEntityToken('scope', 'IP', '10.0.0.1', 16);
      const hash = token.slice('IP_'.length);
      expect(hash).toHaveLength(16);
    });

    it('clamps hashLength to MAX_HASH_LENGTH (64)', () => {
      const token = generateEntityToken('scope', 'IP', '10.0.0.1', 200);
      const hash = token.slice('IP_'.length);
      expect(hash).toHaveLength(64);
    });

    it('floors a fractional hashLength', () => {
      const token = generateEntityToken('scope', 'IP', '10.0.0.1', 8.9);
      const hash = token.slice('IP_'.length);
      expect(hash).toHaveLength(8);
    });

    it('falls back to the default (32) for non-finite hashLength', () => {
      const withNaN = generateEntityToken('scope', 'IP', '10.0.0.1', NaN);
      const withInf = generateEntityToken('scope', 'IP', '10.0.0.1', Infinity);
      expect(withNaN.slice('IP_'.length)).toHaveLength(32);
      expect(withInf.slice('IP_'.length)).toHaveLength(32);
    });

    it('falls back to the default (32) for zero or negative hashLength', () => {
      const withZero = generateEntityToken('scope', 'IP', '10.0.0.1', 0);
      const withNeg = generateEntityToken('scope', 'IP', '10.0.0.1', -1);
      expect(withZero.slice('IP_'.length)).toHaveLength(32);
      expect(withNeg.slice('IP_'.length)).toHaveLength(32);
    });
  });

  describe('determinism', () => {
    it('returns the same token for the same inputs', () => {
      const a = generateEntityToken('scope-abc', 'EMAIL', 'user@example.com');
      const b = generateEntityToken('scope-abc', 'EMAIL', 'user@example.com');
      expect(a).toBe(b);
    });
  });

  describe('delimiter collision protection', () => {
    // The HMAC input uses length-prefixed components so that a value containing ":"
    // cannot collide with a different entityClass/value pair.
    it('entityClass containing ":" does not collide with a split across entityClass/value', () => {
      // Without length-prefixing, ("A:B", "C") and ("A", "B:C") could produce the
      // same HMAC input string.
      const a = generateEntityToken('scope', 'A:B', 'C');
      const b = generateEntityToken('scope', 'A', 'B:C');
      // Compare hash portions only — the entityClass prefixes differ by construction,
      // so comparing the full token would pass even if the HMAC inputs collided.
      expect(a.slice(a.lastIndexOf('_') + 1)).not.toBe(b.slice(b.lastIndexOf('_') + 1));
    });
  });

  describe('invalid inputs', () => {
    it('throws for an empty entityClass', () => {
      expect(() => generateEntityToken('scope', '', 'value')).toThrow('entityClass');
    });
  });

  describe('sensitivity to each input', () => {
    it('produces a different token when value differs', () => {
      const a = generateEntityToken('scope', 'EMAIL', 'a@example.com');
      const b = generateEntityToken('scope', 'EMAIL', 'b@example.com');
      expect(a).not.toBe(b);
    });

    it('produces a different token when entityClass differs', () => {
      const a = generateEntityToken('scope', 'EMAIL', 'x@example.com');
      const b = generateEntityToken('scope', 'IP', 'x@example.com');
      expect(a).not.toBe(b);
    });

    it('produces a different token when executionScope differs', () => {
      const a = generateEntityToken('scope-1', 'EMAIL', 'user@example.com');
      const b = generateEntityToken('scope-2', 'EMAIL', 'user@example.com');
      expect(a).not.toBe(b);
    });
  });
});
