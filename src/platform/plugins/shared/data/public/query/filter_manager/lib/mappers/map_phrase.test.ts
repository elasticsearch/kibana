/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getPhraseDisplayValue, mapPhrase } from './map_phrase';
import type { PhraseFilter, Filter } from '@kbn/es-query';
import type { FieldFormat } from '@kbn/field-formats-plugin/common';
import { EMPTY_LABEL, NULL_LABEL } from '@kbn/field-formats-common';

describe('filter manager utilities', () => {
  describe('mapPhrase()', () => {
    test('should return the key for matching filters', async () => {
      const filter = {
        meta: { index: 'logstash-*' },
        query: { match: { _type: { query: 'apache', type: 'phrase' } } },
      } as PhraseFilter;

      const result = mapPhrase(filter);

      expect(result).toHaveProperty('key', '_type');
    });

    test('should return undefined for none matching', async () => {
      const filter = {
        meta: { index: 'logstash-*' },
        query: { query_string: { query: 'foo:bar' } },
      } as Filter;

      try {
        mapPhrase(filter);
      } catch (e) {
        expect(e).toBe(filter);
      }
    });
  });

  describe('getPhraseDisplayValue()', () => {
    test('without formatter with value', () => {
      const filter = { meta: { value: 'hello' } } as PhraseFilter;
      const result = getPhraseDisplayValue(filter);
      expect(result).toMatchInlineSnapshot(`"hello"`);
    });

    test('without formatter with empty string value returns blank label', () => {
      const filter = { meta: { value: '' } } as PhraseFilter;
      const result = getPhraseDisplayValue(filter);
      expect(result).toBe(EMPTY_LABEL);
    });

    test('without formatter with undefined value returns null label', () => {
      const filter = { meta: { params: {} } } as PhraseFilter;
      const result = getPhraseDisplayValue(filter);
      expect(result).toBe(NULL_LABEL);
    });

    test('without formatter with null value returns null label', () => {
      const filter = { meta: { value: null } } as unknown as PhraseFilter;
      const result = getPhraseDisplayValue(filter);
      expect(result).toBe(NULL_LABEL);
    });

    test('with formatter delegates to formatter for all values', () => {
      const formatter = { convertToText: (val: unknown) => `formatted:${val}` } as FieldFormat;

      expect(getPhraseDisplayValue({ meta: { value: 'hello' } } as PhraseFilter, formatter)).toBe(
        'formatted:hello'
      );
      expect(getPhraseDisplayValue({ meta: { value: '' } } as PhraseFilter, formatter)).toBe(
        'formatted:'
      );
      expect(getPhraseDisplayValue({ meta: { params: {} } } as PhraseFilter, formatter)).toBe(
        'formatted:undefined'
      );
    });
  });
});
