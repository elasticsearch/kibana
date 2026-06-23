/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useParams } from 'react-router-dom';
import { useMemo } from 'react';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { useSyntheticsEsSearch } from '../../../hooks/use_synthetics_es_search';
import { STEP_END_FILTER } from '../../../../../../common/constants/data_filters';
import { asMutableArray } from '../../../../../../common/utils/as_mutable_array';
import type { Ping } from '../../../../../../common/runtime_types';
import { getSyntheticsCcsIndex } from '../../../../../../common/get_synthetics_indices';
import { useSyntheticsRefreshContext } from '../../../contexts';
import { useGetUrlParams } from '../../../hooks';

export function useErrorFailedStep(checkGroups: string[]) {
  const { lastRefresh } = useSyntheticsRefreshContext();

  const { monitorId } = useParams<{ monitorId: string }>();

  const { remoteName } = useGetUrlParams();

  const indexPattern = getSyntheticsCcsIndex(remoteName);

  const { data, loading } = useSyntheticsEsSearch(
    {
      index: checkGroups?.length > 0 ? indexPattern : '',
      size: checkGroups.length,
      query: {
        bool: {
          filter: [
            STEP_END_FILTER,
            {
              exists: {
                field: 'synthetics.error',
              },
            },
            {
              terms: {
                'monitor.check_group': checkGroups,
              },
            },
          ] as QueryDslQueryContainer[],
        },
      },
      sort: asMutableArray([
        { 'synthetics.step.index': { order: 'asc' } },
        { '@timestamp': { order: 'asc' } },
      ] as const),
      _source: ['synthetics.step', 'synthetics.error', 'monitor.check_group'],
    },
    [lastRefresh, monitorId, checkGroups, remoteName],
    { name: 'getMonitorErrorFailedStep' }
  );

  return useMemo(() => {
    const failedSteps = (data?.hits.hits ?? []).map((doc) => {
      return doc._source as Ping;
    });

    return {
      failedSteps,
      loading,
    };
  }, [data, loading]);
}
