/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { IInspectorInfo } from '@kbn/data-plugin/common';
import { useEsSearch } from '@kbn/observability-shared-plugin/public';
import { applyExcludedDataTiersToParams } from '../utils/excluded_data_tiers';

/**
 * Synthetics-aware wrapper around the shared `useEsSearch` hook that injects the
 * `observability:searchExcludedDataTiers` exclusion into every browser-issued
 * query, matching the server-side `SyntheticsEsClient`. Use this instead of
 * `useEsSearch` for any query targeting `synthetics-*` indices.
 */
export const useSyntheticsEsSearch = <
  DocumentSource extends unknown,
  TParams extends estypes.SearchRequest
>(
  params: TParams,
  fnDeps: any[],
  options: { inspector?: IInspectorInfo; name: string }
) => {
  return useEsSearch<DocumentSource, TParams>(
    applyExcludedDataTiersToParams(params),
    fnDeps,
    options
  );
};
