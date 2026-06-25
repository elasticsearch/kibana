/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ISearchRequestParams } from '@kbn/search-types';
import { enforceSpaceScope } from './enforce_space_scope';

const defaultSpaceClause = {
  bool: {
    should: [
      { term: { space_id: 'default' } },
      { bool: { must_not: { exists: { field: 'space_id' } } } },
    ],
  },
};

describe('enforceSpaceScope', () => {
  it('appends a default-space clause to an existing bool.filter array', () => {
    const dsl = {
      index: 'logs-osquery_manager.result*',
      query: { bool: { filter: [{ term: { action_id: 'a-1' } }] } },
    } as unknown as ISearchRequestParams;

    const scoped = enforceSpaceScope(dsl, 'default');

    expect((scoped.query as any).bool.filter).toEqual([
      { term: { action_id: 'a-1' } },
      defaultSpaceClause,
    ]);
  });

  it('scopes a named space exactly, without a missing-field fallback', () => {
    const dsl = {
      query: { bool: { filter: [{ term: { action_id: 'a-1' } }] } },
    } as unknown as ISearchRequestParams;

    const scoped = enforceSpaceScope(dsl, 'my-space');

    const filter = (scoped.query as any).bool.filter;
    expect(filter).toContainEqual({ term: { space_id: 'my-space' } });
    expect(JSON.stringify(filter)).not.toContain('exists');
  });

  it('creates the bool.filter structure when the dsl has no query', () => {
    const dsl = { index: 'logs-osquery_manager.result*' } as unknown as ISearchRequestParams;

    const scoped = enforceSpaceScope(dsl, 'my-space');

    expect((scoped.query as any).bool.filter).toEqual([{ term: { space_id: 'my-space' } }]);
  });

  it('wraps a non-array existing filter into an array', () => {
    const dsl = {
      query: { bool: { filter: { term: { action_id: 'a-1' } } } },
    } as unknown as ISearchRequestParams;

    const scoped = enforceSpaceScope(dsl, 'my-space');

    expect((scoped.query as any).bool.filter).toEqual([
      { term: { action_id: 'a-1' } },
      { term: { space_id: 'my-space' } },
    ]);
  });

  it('preserves other query and dsl fields (e.g. must_not, pit, sort)', () => {
    const dsl = {
      pit: { id: 'pit-1' },
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: {
        bool: {
          filter: [],
          must_not: [{ exists: { field: 'error' } }],
        },
      },
    } as unknown as ISearchRequestParams;

    const scoped = enforceSpaceScope(dsl, 'my-space');

    expect(scoped.pit).toEqual({ id: 'pit-1' });
    expect(scoped.sort).toEqual([{ '@timestamp': { order: 'desc' } }]);
    expect((scoped.query as any).bool.must_not).toEqual([{ exists: { field: 'error' } }]);
    expect((scoped.query as any).bool.filter).toEqual([{ term: { space_id: 'my-space' } }]);
  });
});
