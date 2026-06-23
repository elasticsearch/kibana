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
import type { Ping } from '../../../../../../common/runtime_types';
import { ConfigKey } from '../../../../../../common/runtime_types';
import {
  EXCLUDE_RUN_ONCE_FILTER,
  getTimeSpanFilter,
} from '../../../../../../common/constants/client_defaults';
import { useSyntheticsRefreshContext } from '../../../contexts/synthetics_refresh_context';
import { useInlineErrorsCount } from './use_inline_errors_count';
import { SYNTHETICS_INDEX_PATTERN } from '../../../../../../common/constants';

const sortFieldMap: Record<string, string> = {
  ['name.keyword']: 'monitor.name',
  ['urls.keyword']: 'url.full',
  ['type.keyword']: 'monitor.type',
  '@timestamp': '@timestamp',
};

export const getInlineErrorFilters = () => [
  {
    exists: {
      field: 'summary',
    },
  },
  {
    exists: {
      field: 'error',
    },
  },
  {
    bool: {
      minimum_should_match: 1,
      should: [
        {
          match_phrase: {
            'error.message': 'journey did not finish executing',
          },
        },
        {
          match_phrase: {
            'error.message': 'ReferenceError:',
          },
        },
      ],
    },
  },
  getTimeSpanFilter(),
  EXCLUDE_RUN_ONCE_FILTER,
];

export function useInlineErrors({
  onlyInvalidMonitors,
  sortField = '@timestamp',
  sortOrder = 'desc',
}: {
  onlyInvalidMonitors?: boolean;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const syntheticsMonitors = useSelector(selectEncryptedSyntheticsSavedMonitors);

  const { lastRefresh } = useSyntheticsRefreshContext();

  const configIds = syntheticsMonitors.map((monitor) => monitor[ConfigKey.CONFIG_ID]);

  const doFetch = configIds.length > 0 || onlyInvalidMonitors;

  const { data } = useSyntheticsEsSearch(
    {
      index: doFetch ? SYNTHETICS_INDEX_PATTERN : '',
      size: 1000,
      query: {
        bool: {
          filter: getInlineErrorFilters(),
        },
      },
      collapse: { field: 'monitor.id' },
      sort: sortFieldMap[sortField] ? [{ [sortFieldMap[sortField]]: sortOrder }] : undefined,
    },
    [syntheticsMonitors, lastRefresh, doFetch, sortField, sortOrder],
    { name: 'getInvalidMonitors' }
  );

  const { count, loading: countLoading } = useInlineErrorsCount();

  return useMemo(() => {
    const errorSummaries = data?.hits.hits.map(({ _source: source }) => ({
      ...(source as Ping),
      timestamp: (source as any)['@timestamp'],
    }));

    return { loading: countLoading, errorSummaries, count };
  }, [count, countLoading, data]);
}
