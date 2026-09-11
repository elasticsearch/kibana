/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  isOfQueryType,
  isOfAggregateQueryType,
  isEmptyEsqlQuery,
  getAggregateQueryMode,
} from './es_aggregate_query';

describe('esql query helpers', () => {
  describe('isOfQueryType', () => {
    it('should return true for a Query type query', () => {
      const flag = isOfQueryType({ query: 'foo', language: 'test' });
      expect(flag).toBe(true);
    });

    it('should return false for an Aggregate type query', () => {
      const flag = isOfQueryType({ esql: 'FROM foo' });
      expect(flag).toBe(false);
    });
  });

  describe('isOfAggregateQueryType', () => {
    it('should return false for a Query type query', () => {
      const flag = isOfAggregateQueryType({ query: 'foo', language: 'test' });
      expect(flag).toBe(false);
    });

    it('should return false for an undefined query', () => {
      const flag = isOfAggregateQueryType(undefined);
      expect(flag).toBe(false);
    });

    it('should return true for an Aggregate type query', () => {
      const flag = isOfAggregateQueryType({ esql: 'FROM foo' });
      expect(flag).toBe(true);
    });
  });

  describe('isEmptyEsqlQuery', () => {
    it('should return true for an empty or whitespace ES|QL query', () => {
      expect(isEmptyEsqlQuery({ esql: '' })).toBe(true);
      expect(isEmptyEsqlQuery({ esql: '   ' })).toBe(true);
    });

    it('should return false for a non-empty ES|QL query', () => {
      expect(isEmptyEsqlQuery({ esql: 'FROM foo' })).toBe(false);
    });

    it('should return false for classic queries and undefined', () => {
      expect(isEmptyEsqlQuery({ query: '', language: 'kuery' })).toBe(false);
      expect(isEmptyEsqlQuery(undefined)).toBe(false);
    });
  });

  describe('getAggregateQueryMode', () => {
    it('should return esql for an ESQL AggregateQuery type', () => {
      const mode = getAggregateQueryMode({ esql: 'foo | where field > 100' });
      expect(mode).toBe('esql');
    });
  });
});
