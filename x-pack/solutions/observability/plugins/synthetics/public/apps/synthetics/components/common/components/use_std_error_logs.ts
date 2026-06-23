/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createEsParams } from '@kbn/observability-shared-plugin/public';
import { useSyntheticsEsSearch } from '../../../hooks/use_synthetics_es_search';
import type { Ping } from '../../../../../../common/runtime_types';
import { getSyntheticsCcsIndex } from '../../../../../../common/get_synthetics_indices';

export const useStdErrorLogs = ({
  checkGroup,
  remoteName,
}: {
  checkGroup?: string;
  remoteName?: string;
}) => {
  const index = !checkGroup ? '' : getSyntheticsCcsIndex(remoteName);

  const { data, loading } = useSyntheticsEsSearch(
    createEsParams({
      index,
      size: 1000,
      query: {
        bool: {
          filter: [
            {
              terms: {
                'synthetics.type': ['stderr', 'stdout'],
              },
            },
            ...(checkGroup
              ? [
                  {
                    term: {
                      'monitor.check_group': checkGroup,
                    },
                  },
                ]
              : []),
          ],
        },
      },
    }),
    [checkGroup, remoteName],
    { name: 'getStdErrLogs' }
  );

  return {
    items: data?.hits.hits.map((hit) => ({ ...(hit._source as Ping), id: hit._id })) ?? [],
    loading,
  };
};
