/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { normalizePersistedFilterMeta } from './normalize_filter_meta';

describe('normalizePersistedFilterMeta', () => {
  it('removes meta.value when it is an array ("is one of")', () => {
    expect(
      normalizePersistedFilterMeta({ type: 'phrases', params: ['a', 'b'], value: ['a', 'b'] })
    ).toEqual({ type: 'phrases', params: ['a', 'b'] });
  });

  it('removes meta.value when it is an object (range)', () => {
    expect(
      normalizePersistedFilterMeta({
        type: 'range',
        params: { gte: 1, lt: 2 },
        value: { gte: 1, lt: 2 },
      })
    ).toEqual({ type: 'range', params: { gte: 1, lt: 2 } });
  });

  it('keeps a string meta.value ("is")', () => {
    expect(normalizePersistedFilterMeta({ type: 'phrase', value: 'test' })).toEqual({
      type: 'phrase',
      value: 'test',
    });
  });

  it('leaves meta unchanged when value is absent', () => {
    expect(normalizePersistedFilterMeta({ type: 'custom', key: 'query' })).toEqual({
      type: 'custom',
      key: 'query',
    });
  });
});
