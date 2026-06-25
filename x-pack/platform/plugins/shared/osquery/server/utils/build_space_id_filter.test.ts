/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildSpaceIdFilter } from './build_space_id_filter';

describe('buildSpaceIdFilter', () => {
  it('always returns a filter clause', () => {
    expect(buildSpaceIdFilter('default')).toBeDefined();
    expect(buildSpaceIdFilter('my-space')).toBeDefined();
  });

  it('matches the default space OR a missing space_id field in the default space', () => {
    expect(buildSpaceIdFilter('default')).toEqual({
      bool: {
        should: [
          { term: { space_id: 'default' } },
          { bool: { must_not: { exists: { field: 'space_id' } } } },
        ],
      },
    });
  });

  it('matches the space exactly in a named space (no missing-field fallback)', () => {
    expect(buildSpaceIdFilter('my-space')).toEqual({ term: { space_id: 'my-space' } });
  });
});
