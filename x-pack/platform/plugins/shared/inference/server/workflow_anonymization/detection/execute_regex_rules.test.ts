/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { executeRegexRules } from './execute_regex_rules';
import type { PiiRegexRule } from './types';

const r = (entityClass: string, pattern: string, maxMatchLength?: number): PiiRegexRule => ({
  entityClass,
  pattern,
  maxMatchLength,
});

describe('executeRegexRules', () => {
  describe('basic matching', () => {
    it('finds a simple IP address match', () => {
      const rules = [r('IP', '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b')];
      const records = [{ content: 'connect to 10.0.0.1 now' }];
      const results = executeRegexRules({ rules, records });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        matchValue: '10.0.0.1',
        entityClass: 'IP',
        start: 11,
        end: 19,
        ruleIndex: 0,
        recordIndex: 0,
        recordKey: 'content',
      });
    });

    it('finds multiple matches in one field', () => {
      const rules = [r('IP', '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b')];
      const records = [{ content: '10.0.0.1 and 192.168.1.1' }];
      const results = executeRegexRules({ rules, records });

      expect(results).toHaveLength(2);
      expect(results[0].matchValue).toBe('10.0.0.1');
      expect(results[1].matchValue).toBe('192.168.1.1');
    });

    it('returns no matches when nothing in the field satisfies the rule', () => {
      const rules = [r('EMAIL', '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}')];
      const records = [{ content: 'no email here' }];
      expect(executeRegexRules({ rules, records })).toHaveLength(0);
    });

    it('preserves ruleIndex and recordIndex for multi-rule multi-record inputs', () => {
      const rules = [
        r('IP', '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b'),
        r('EMAIL', '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}'),
      ];
      const records = [{ content: 'no match here' }, { content: 'reach me at user@example.com' }];
      const results = executeRegexRules({ rules, records });

      // Only the email rule fires on record[1]
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ ruleIndex: 1, recordIndex: 1, entityClass: 'EMAIL' });
    });
  });

  describe('zero-length match handling', () => {
    // The snapshot used `break` on zero-length matches, which abandoned the rest of the
    // field — this verifies the correct `continue` (advance-one-char) behavior.

    it('finds ALL non-zero occurrences of a pattern that can match zero characters', () => {
      // a* matches "" (zero-length) between non-'a' chars AND "aaa" as a run.
      // The advance-one-char guard must skip the zero-length hits so both "aaa"
      // runs are still found.
      const rules = [r('A_RUN', 'a*')];
      const records = [{ content: 'aaa hello aaa world' }];
      const results = executeRegexRules({ rules, records });

      const matchValues = results.map((m) => m.matchValue);
      expect(matchValues).toContain('aaa');
      expect(matchValues.filter((v) => v === 'aaa')).toHaveLength(2);
    });

    it('does not infinite-loop on a pattern that always matches empty string', () => {
      const rules = [r('EMPTY', 'x*')]; // matches "" everywhere
      const records = [{ content: 'abc' }];
      // Should terminate without hanging; zero-length matches are skipped
      const results = executeRegexRules({ rules, records });
      // x* matches "" at every position — all skipped; "x" not present so no non-empty match
      expect(results).toHaveLength(0);
    });
  });

  describe('native RegExp fallback for RE2-unsupported constructs', () => {
    // RE2 does not support lookahead, lookbehind, or backreferences.
    // Those patterns fall back to native RegExp and must still produce matches.

    it('matches a lookahead pattern via native RegExp fallback', () => {
      // (?=[a-z]) is valid PCRE/native but not RE2
      const rules = [r('HOST', '(?=[a-z])\\w+')];
      const records = [{ content: 'somehost' }];
      const results = executeRegexRules({ rules, records });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchValue).toBe('somehost');
    });

    it('matches a lookbehind pattern via native RegExp fallback', () => {
      const rules = [r('AFTER_AT', '(?<=@)\\w+')];
      const records = [{ content: 'user@example' }];
      const results = executeRegexRules({ rules, records });
      expect(results.length).toBe(1);
      expect(results[0].matchValue).toBe('example');
    });

    it('matches a backreference pattern via native RegExp fallback', () => {
      const rules = [r('REPEATED', '(\\w+)\\s+\\1')];
      const records = [{ content: 'hello hello' }];
      const results = executeRegexRules({ rules, records });
      expect(results.length).toBe(1);
      expect(results[0].matchValue).toBe('hello hello');
    });
  });

  describe('truly invalid patterns throw (fail closed)', () => {
    // Patterns that are invalid in both RE2 and native RegExp must still throw so
    // the caller can apply its own failure-mode policy.

    it('throws for an unclosed group', () => {
      const rules = [r('BAD', '(unclosed')];
      const records = [{ content: 'test' }];
      expect(() => executeRegexRules({ rules, records })).toThrow();
    });
  });

  describe('maxMatchLength', () => {
    it('discards matches that exceed maxMatchLength', () => {
      // Use a simple unbounded pattern and a short limit to verify the filter
      const maxLen = 5;
      const rules = [r('WORD', '[a-z]+', maxLen)];
      // 'short' (5 chars, exactly at limit) passes; 'toolong' (7 chars) does not
      const records = [{ content: 'short toolong' }];
      const results = executeRegexRules({ rules, records });

      expect(results.map((m) => m.matchValue)).toEqual(['short']);
    });

    it('accepts matches exactly at maxMatchLength', () => {
      const rules = [r('WORD', '[a-z]+', 5)];
      const records = [{ content: 'exact' }]; // 5 chars
      const results = executeRegexRules({ rules, records });
      expect(results).toHaveLength(1);
      expect(results[0].matchValue).toBe('exact');
    });

    it('does not filter matches when maxMatchLength is not set', () => {
      const longWord = 'a'.repeat(300);
      const rules = [r('WORD', '[a-z]+')]; // no maxMatchLength
      const records = [{ content: longWord }];
      const results = executeRegexRules({ rules, records });
      expect(results).toHaveLength(1);
      expect(results[0].matchValue).toBe(longWord);
    });
  });

  describe('skips empty string fields', () => {
    it('ignores empty string fields', () => {
      const rules = [r('IP', '\\b\\d+\\.\\d+\\.\\d+\\.\\d+\\b')];
      const records = [{ content: '', other: '10.0.0.1' }];
      const results = executeRegexRules({ rules, records });
      expect(results).toHaveLength(1);
      expect(results[0].recordKey).toBe('other');
    });
  });
});
