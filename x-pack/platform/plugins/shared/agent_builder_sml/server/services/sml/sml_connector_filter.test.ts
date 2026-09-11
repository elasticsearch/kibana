/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SmlSearchFilterType } from '../../../common/http_api/sml';
import { buildAgentFilters, buildConstraintsFilter } from './sml_service';

// buildConstraintsFilter is designed to combine clauses from multiple
// SmlSearchFilterType values. When the enum grows beyond 'connector', add
// multi-type tests here.

describe('buildConstraintsFilter', () => {
  it('returns undefined when constraints is undefined', () => {
    expect(buildConstraintsFilter(undefined)).toBeUndefined();
  });

  it('returns undefined when constraints is empty', () => {
    expect(buildConstraintsFilter({})).toBeUndefined();
  });

  it('returns undefined when type criteria has no ids', () => {
    expect(buildConstraintsFilter({ [SmlSearchFilterType.connector]: {} })).toBeUndefined();
  });

  it('excludes the type entirely when ids is empty', () => {
    const filter = buildConstraintsFilter({ [SmlSearchFilterType.connector]: { ids: [] } });
    expect(filter).toEqual({
      bool: { must_not: [{ term: { type: 'connector' } }] },
    });
  });

  it('returns a filter for a single type with ids', () => {
    const filter = buildConstraintsFilter({
      [SmlSearchFilterType.connector]: { ids: ['conn-1', 'conn-2'] },
    });
    expect(filter).toEqual({
      bool: {
        should: [
          {
            terms: { 'attributes.origin.uri': ['connector://conn-1', 'connector://conn-2'] },
          },
          {
            bool: {
              must_not: [{ term: { type: 'connector' } }],
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  });
});

describe('buildAgentFilters', () => {
  it('returns an empty list when filters is undefined', () => {
    expect(buildAgentFilters(undefined)).toEqual([]);
  });

  it('returns an empty list when filters is empty', () => {
    expect(buildAgentFilters({})).toEqual([]);
  });

  it('treats empty arrays as no constraint, not "exclude everything"', () => {
    // The agent has no way to express "exclude everything"; the more useful
    // default for an accidental `[]` is to ignore it.
    expect(buildAgentFilters({ types: [], tags: [] })).toEqual([]);
  });

  it('emits a terms clause on `type` when `types` is non-empty', () => {
    expect(buildAgentFilters({ types: ['dashboard', 'lens'] })).toEqual([
      { terms: { type: ['dashboard', 'lens'] } },
    ]);
  });

  it('emits a terms clause on `tags` when `tags` is non-empty', () => {
    expect(buildAgentFilters({ tags: ['production'] })).toEqual([
      { terms: { tags: ['production'] } },
    ]);
  });

  it('emits both clauses (ANDed via the outer filter list) when both are non-empty', () => {
    expect(buildAgentFilters({ types: ['dashboard'], tags: ['production', 'sales'] })).toEqual([
      { terms: { type: ['dashboard'] } },
      { terms: { tags: ['production', 'sales'] } },
    ]);
  });
});
