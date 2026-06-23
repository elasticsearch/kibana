/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { searchExcludedDataTiers } from '@kbn/observability-plugin/common';
import type { DataTier } from '@kbn/observability-shared-plugin/common';
import { excludeTiersQuery } from '@kbn/observability-utils-common/es/queries/exclude_tiers_query';
import { kibanaService } from '../../../utils/kibana_service';

/**
 * Reads the `observability:searchExcludedDataTiers` advanced setting from the
 * client-side uiSettings cache. Mirrors the server-side `SyntheticsEsClient` so
 * browser-issued queries (via `data.search`) skip the same tiers. Falls back to
 * `[]` (no exclusion) when uiSettings is unavailable, e.g. in unit tests.
 */
export const getExcludedDataTiers = (): DataTier[] => {
  try {
    return kibanaService.coreStart.uiSettings.get<DataTier[]>(searchExcludedDataTiers, []) ?? [];
  } catch {
    return [];
  }
};

/**
 * Wraps a search request's query with a `must_not { terms: { _tier } }` filter
 * for the configured excluded data tiers, reusing the shared `excludeTiersQuery`
 * util. Returns the params untouched when no tiers are excluded (the default),
 * so existing behavior is unchanged unless an operator opts in.
 */
export const applyExcludedDataTiersToParams = <TParams extends estypes.SearchRequest>(
  params: TParams
): TParams => {
  const excludedDataTiers = getExcludedDataTiers();
  if (!excludedDataTiers.length) {
    return params;
  }

  const { query } = params;
  // The spread only replaces `query` with a valid `QueryDslQueryContainer`, so
  // the result is still a `TParams`; TS cannot infer that through a generic spread.
  return {
    ...params,
    query: {
      bool: {
        filter: [...(query ? [query] : []), ...excludeTiersQuery(excludedDataTiers)],
      },
    },
  } as TParams;
};
