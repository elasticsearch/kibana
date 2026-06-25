/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { SourceFilter } from '../../../common/api/unified_history/types';
import { buildSpaceIdFilter } from '../../utils/build_space_id_filter';

export type SortValues = Array<string | number>;

interface LiveActionsQueryOptions {
  pageSize: number;
  searchAfter?: SortValues;
  kuery?: string;
  userIds?: string[];
  tags?: string[];
  spaceId: string;
  startDate?: string;
  endDate?: string;
  sortDirection?: 'asc' | 'desc';
  activeFilters?: Set<SourceFilter>;
}

export const buildLiveActionsQuery = ({
  pageSize,
  searchAfter,
  kuery,
  userIds,
  tags,
  spaceId,
  startDate,
  endDate,
  sortDirection = 'desc',
  activeFilters,
}: LiveActionsQueryOptions): {
  body: Record<string, unknown>;
} => {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { type: { value: 'INPUT_ACTION' } } },
    { term: { input_type: { value: 'osquery' } } },
    buildSpaceIdFilter(spaceId) as estypes.QueryDslQueryContainer,
  ];

  if (startDate || endDate) {
    const rangeFilter: Record<string, string> = {};
    if (startDate) rangeFilter.gte = startDate;
    if (endDate) rangeFilter.lte = endDate;
    filters.push({ range: { '@timestamp': rangeFilter } });
  }

  if (kuery) {
    filters.push({
      multi_match: {
        query: kuery,
        type: 'bool_prefix',
        fields: ['pack_name', 'queries.query', 'queries.id'],
        operator: 'and',
      },
    });
  }

  if (userIds && userIds.length > 0) {
    filters.push({ terms: { user_id: userIds } });
  }

  if (tags && tags.length > 0) {
    filters.push({ terms: { tags } });
  }

  if (activeFilters) {
    const wantsLive = activeFilters.has('live');
    const wantsRule = activeFilters.has('rule');

    if (wantsRule && !wantsLive) {
      // Rule-only: keep actions that have alert_ids
      filters.push({ exists: { field: 'alert_ids' } });
    } else if (wantsLive && !wantsRule) {
      // Live-only: exclude actions that have alert_ids
      filters.push({ bool: { must_not: { exists: { field: 'alert_ids' } } } });
    }
    // Both live+rule selected (or neither, which shouldn't reach here): no filter needed
  }

  return {
    body: {
      query: {
        bool: {
          filter: filters,
        },
      },
      size: pageSize,
      sort: [
        { '@timestamp': { order: sortDirection } },
        { _shard_doc: { order: sortDirection === 'desc' ? 'asc' : 'desc' } },
      ],
      ...(searchAfter ? { search_after: searchAfter } : {}),
      _source: true,
    },
  };
};
