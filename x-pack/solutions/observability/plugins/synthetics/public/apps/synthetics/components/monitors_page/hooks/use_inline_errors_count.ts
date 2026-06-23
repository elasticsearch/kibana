/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useSelector } from 'react-redux';
import { useMemo } from 'react';
import { useSyntheticsEsSearch } from '../../../hooks/use_synthetics_es_search';
import { selectEncryptedSyntheticsSavedMonitors } from '../../../state';
import { useSyntheticsRefreshContext } from '../../../contexts/synthetics_refresh_context';
import { getInlineErrorFilters } from './use_inline_errors';
import { SYNTHETICS_INDEX_PATTERN } from '../../../../../../common/constants';

export function useInlineErrorsCount() {
  const syntheticsMonitors = useSelector(selectEncryptedSyntheticsSavedMonitors);

  const { lastRefresh } = useSyntheticsRefreshContext();

  const { data, loading } = useSyntheticsEsSearch(
    {
      index: SYNTHETICS_INDEX_PATTERN,
      size: 0,
      query: {
        bool: {
          filter: getInlineErrorFilters(),
        },
      },
      aggs: {
        total: {
          cardinality: { field: 'monitor.id' },
        },
      },
    },
    [syntheticsMonitors, lastRefresh],
    { name: 'getInvalidMonitorsCount' }
  );

  return useMemo(() => {
    const errorSummariesCount = data?.aggregations?.total.value;

    return { loading: loading ?? false, count: errorSummariesCount };
  }, [data, loading]);
}
