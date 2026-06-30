/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getCheckGroupTimeRangeFilter } from './client_defaults';

describe('getCheckGroupTimeRangeFilter', () => {
  it('builds a +/- 1h @timestamp range around the run timestamp', () => {
    expect(getCheckGroupTimeRangeFilter('2024-01-01T00:00:00.000Z')).toEqual({
      range: {
        '@timestamp': {
          gte: '2023-12-31T23:00:00.000Z',
          lte: '2024-01-01T01:00:00.000Z',
        },
      },
    });
  });

  it('falls back to match_all for an unparseable timestamp instead of throwing', () => {
    expect(() => getCheckGroupTimeRangeFilter('garbage')).not.toThrow();
    expect(getCheckGroupTimeRangeFilter('garbage')).toEqual({ match_all: {} });
  });
});
