/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLCallbacks, ESQLFieldWithMetadata } from '@kbn/esql-types';
import { Parser } from '@elastic/esql';
import { QueryColumns } from '.';

describe('QueryColumns', () => {
  const fields: ESQLFieldWithMetadata[] = [
    { name: 'doubleField', type: 'double', userDefined: false },
    { name: 'keywordField', type: 'keyword', userDefined: false },
  ];

  const callbacks: ESQLCallbacks = {
    getColumnsFor: jest.fn(async () => fields),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const getColumnMap = async (query: string) => {
    const { root } = Parser.parse(query);
    return new QueryColumns(root, query, callbacks).asMap();
  };

  it('preserves the type of a column created from a parenthesized EVAL expression', async () => {
    const columns = await getColumnMap('FROM index | EVAL computed = (doubleField + 1)');

    expect(columns.get('computed')).toEqual(
      expect.objectContaining({
        type: 'double',
      })
    );
  });

  it('preserves generated STATS column names and types for parenthesized expressions', async () => {
    const columns = await getColumnMap('FROM index | STATS (AVG(doubleField)) BY (keywordField)');

    expect(columns.get('AVG(doubleField)')).toEqual(
      expect.objectContaining({
        type: 'double',
      })
    );
    expect(columns.get('keywordField')).toEqual(
      expect.objectContaining({
        type: 'keyword',
      })
    );
    expect(columns.has('(AVG(doubleField))')).toBe(false);
    expect(columns.has('(keywordField)')).toBe(false);
  });
});
