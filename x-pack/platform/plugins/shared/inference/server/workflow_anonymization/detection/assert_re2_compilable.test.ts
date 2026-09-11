/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { assertRe2Compilable } from './assert_re2_compilable';

describe('assertRe2Compilable', () => {
  describe('valid RE2 patterns', () => {
    it('does not throw for a simple literal pattern', () => {
      expect(() => assertRe2Compilable('hello')).not.toThrow();
    });

    it('does not throw for a character class pattern', () => {
      expect(() => assertRe2Compilable('[a-z0-9]+')).not.toThrow();
    });

    it('does not throw for an IP-address pattern', () => {
      expect(() =>
        assertRe2Compilable('\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b')
      ).not.toThrow();
    });
  });

  describe('RE2-unsupported constructs throw', () => {
    it('throws for a positive lookahead', () => {
      expect(() => assertRe2Compilable('(?=a)b')).toThrow();
    });

    it('throws for a negative lookahead', () => {
      expect(() => assertRe2Compilable('(?!a)b')).toThrow();
    });

    it('throws for a lookbehind', () => {
      expect(() => assertRe2Compilable('(?<=@)\\w+')).toThrow();
    });

    it('throws for a backreference', () => {
      expect(() => assertRe2Compilable('(\\w+)\\s+\\1')).toThrow();
    });
  });

  describe('invalid patterns throw', () => {
    it('throws for an unclosed group', () => {
      expect(() => assertRe2Compilable('(unclosed')).toThrow();
    });
  });

  describe('error message quality', () => {
    it('includes the offending pattern in the error message', () => {
      const pattern = '(?=a)b';
      expect(() => assertRe2Compilable(pattern)).toThrow(pattern);
    });

    it('mentions lookahead / lookbehind / backreferences in the message', () => {
      expect(() => assertRe2Compilable('(?=a)b')).toThrow('lookahead');
    });
  });
});
