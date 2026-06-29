/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Query } from '@elastic/eui';
import { parseSearchQuery } from './utils';

describe('parseSearchQuery', () => {
  it('returns an empty query for empty input', () => {
    expect(parseSearchQuery('').ast.clauses).toEqual([]);
  });

  it('preserves the raw text for plain-text input', () => {
    expect(parseSearchQuery('logs').text).toBe('logs');
  });

  it('parses field clauses such as dataQuality', () => {
    const query = parseSearchQuery('dataQuality:degraded');

    expect(query.ast.getFieldClauses('dataQuality')).toEqual([
      expect.objectContaining({ field: 'dataQuality', value: 'degraded' }),
    ]);
  });

  it('does not crash on input that is invalid EUI query syntax', () => {
    // The raw parser rejects a leading comma...
    expect(() => Query.parse(',')).toThrow();

    // ...while the wrapper keeps the raw text as a plain-text filter with no clauses.
    const query = parseSearchQuery(',');

    expect(query.text).toBe(',');
    expect(query.ast.clauses).toEqual([]);
  });
});
