/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchRequest } from '@elastic/elasticsearch/lib/api/types';
import { useSyntheticsEsSearch } from './use_synthetics_es_search';
import { getSyntheticsCcsIndex } from '../../../../common/get_synthetics_indices';
import type { Ping } from '../../../../common/runtime_types';

export const useMonitorDetail = (
  configId: string,
  location: string,
  remoteName?: string
): { data?: Ping; loading?: boolean } => {
  const index = getSyntheticsCcsIndex(remoteName);

  const params = {
    index,
    size: 1,
    query: {
      bool: {
        filter: [
          {
            term: {
              config_id: configId,
            },
          },
          {
            term: {
              'observer.geo.name': location,
            },
          },
          {
            exists: {
              field: 'summary',
            },
          },
        ],
      },
    },
    sort: [{ '@timestamp': 'desc' as const }],
  };
  const { data: result, loading } = useSyntheticsEsSearch<
    Ping & { '@timestamp': string },
    SearchRequest
  >(params, [configId, location, remoteName], {
    name: 'getMonitorStatusByLocation',
  });

  if (!result || result.hits.hits.length !== 1) return { data: undefined, loading };
  return {
    data: result.hits.hits[0]._source,
    loading,
  };
};
