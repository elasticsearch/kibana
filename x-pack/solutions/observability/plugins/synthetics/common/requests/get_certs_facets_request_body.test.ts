/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { getCertsFacetsRequestBody } from './get_certs_facets_request_body';

describe('getCertsFacetsRequestBody', () => {
  const params = { monitorIds: ['monitor-1'] };

  // Picks the local-vs-remote `bool.should` by its `_index` filter — the
  // cert-type `bool.should` (lightweight vs browser) shares the same shape.
  const findScopingClause = (body: estypes.SearchRequest) => {
    const filters = (body.query?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
    return filters.find((clause) => {
      const should = clause?.bool?.should as estypes.QueryDslQueryContainer[] | undefined;
      return should?.some((branch) => {
        const branchFilters = branch?.bool?.filter as estypes.QueryDslQueryContainer[] | undefined;
        return branchFilters?.some(
          (f) => f?.wildcard?._index !== undefined || f?.bool?.must_not !== undefined
        );
      });
    });
  };

  it('keeps a flat monitor.id terms filter when CCS is disabled', () => {
    const body = getCertsFacetsRequestBody(params) as estypes.SearchRequest;
    expect(findScopingClause(body)).toBeUndefined();
    const filters = (body.query?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
    expect(filters).toEqual(expect.arrayContaining([{ terms: { 'monitor.id': ['monitor-1'] } }]));
  });

  it('switches to the local/remote bool.should split when CCS is enabled', () => {
    const body = getCertsFacetsRequestBody(params, {
      ccsEnabled: true,
      remoteNames: ['cluster1'],
      spaceId: 'team-a',
    }) as estypes.SearchRequest;

    const scoping = findScopingClause(body);
    expect(scoping).toBeDefined();
    const branches = scoping?.bool?.should as estypes.QueryDslQueryContainer[] | undefined;
    expect(branches).toHaveLength(2);

    const remote = branches?.[1]?.bool?.filter as estypes.QueryDslQueryContainer[] | undefined;
    expect(remote).toEqual(
      expect.arrayContaining([
        { wildcard: { _index: '*:*' } },
        { terms: { 'meta.space_id': ['team-a', '*'] } },
      ])
    );
    expect(remote?.find((f) => f?.bool?.should !== undefined)).toEqual({
      bool: {
        should: [{ wildcard: { _index: 'cluster1:*' } }],
        minimum_should_match: 1,
      },
    });
  });
});
