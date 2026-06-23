/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { applyResponseFilter } from './apply_response_filter';

const JSON_CONTENT_TYPE = 'application/json';
const TEXT_CONTENT_TYPE = 'text/plain';

describe('applyResponseFilter', () => {
  describe('no-op cases', () => {
    it('returns text unchanged when expression is empty', () => {
      const text = 'apple\nbanana\npineapple';
      expect(
        applyResponseFilter({
          text,
          contentType: TEXT_CONTENT_TYPE,
          state: { expression: '', mode: 'regex', invertMatch: false, isExpanded: false },
        })
      ).toBe(text);
    });

    it('returns text unchanged when expression is empty in jq mode', () => {
      const text = '{"foo":"bar"}';
      expect(
        applyResponseFilter({
          text,
          contentType: JSON_CONTENT_TYPE,
          state: { expression: '', mode: 'jq', invertMatch: false, isExpanded: false },
        })
      ).toBe(text);
    });
  });

  describe('regex mode', () => {
    const text = 'apple\nbanana\npineapple';

    it('filters lines matching the regex', () => {
      expect(
        applyResponseFilter({
          text,
          contentType: TEXT_CONTENT_TYPE,
          state: { expression: 'p+l', mode: 'regex', invertMatch: false, isExpanded: false },
        })
      ).toBe('apple\npineapple');
    });

    it('inverts the filter when invertMatch is true', () => {
      expect(
        applyResponseFilter({
          text,
          contentType: TEXT_CONTENT_TYPE,
          state: { expression: 'p+l', mode: 'regex', invertMatch: true, isExpanded: false },
        })
      ).toBe('banana');
    });

    it('returns original text when the regex is invalid', () => {
      expect(
        applyResponseFilter({
          text,
          contentType: TEXT_CONTENT_TYPE,
          state: { expression: '*invalid', mode: 'regex', invertMatch: false, isExpanded: false },
        })
      ).toBe(text);
    });

    it('works on JSON content type (line-by-line from the already-stringified body)', () => {
      const jsonText = '{\n  "status": "green",\n  "count": 5\n}';
      expect(
        applyResponseFilter({
          text: jsonText,
          contentType: JSON_CONTENT_TYPE,
          state: { expression: 'status', mode: 'regex', invertMatch: false, isExpanded: false },
        })
      ).toBe('  "status": "green",');
    });
  });

  describe('jq mode', () => {
    const text = JSON.stringify({ foo: 'bar', baz: 'quux' });

    it('applies a jq expression to a JSON response', () => {
      const result = applyResponseFilter({
        text,
        contentType: JSON_CONTENT_TYPE,
        state: { expression: '.foo', mode: 'jq', invertMatch: false, isExpanded: false },
      });
      expect(result).toBe('"bar"');
    });

    it('returns original text when the jq expression is invalid', () => {
      const result = applyResponseFilter({
        text,
        contentType: JSON_CONTENT_TYPE,
        state: {
          expression: 'blah invalid |||',
          mode: 'jq',
          invertMatch: false,
          isExpanded: false,
        },
      });
      expect(result).toBe(text);
    });

    it('skips jq filtering for non-JSON content types', () => {
      const plainText = 'some plain text';
      expect(
        applyResponseFilter({
          text: plainText,
          contentType: TEXT_CONTENT_TYPE,
          state: { expression: '.foo', mode: 'jq', invertMatch: false, isExpanded: false },
        })
      ).toBe(plainText);
    });
  });
});
