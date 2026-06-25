/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { buildSpaceIdFilter } from '../../utils/build_space_id_filter';

interface ScheduledResponsesQueryOptions {
  cursor?: string;
  scheduledOffset?: number;
  pageSize?: number;
  packIds?: string[];
  scheduleIds?: string[];
  spaceId: string;
  startDate?: string;
  endDate?: string;
  sortDirection?: 'asc' | 'desc';
}

export const buildScheduledResponsesQuery = ({
  cursor,
  scheduledOffset = 0,
  pageSize = 20,
  packIds,
  scheduleIds,
  spaceId,
  startDate,
  endDate,
  sortDirection = 'desc',
}: ScheduledResponsesQueryOptions): {
  body: Record<string, unknown>;
} => {
  const filters: estypes.QueryDslQueryContainer[] = [
    { exists: { field: 'schedule_id' } },
    buildSpaceIdFilter(spaceId) as estypes.QueryDslQueryContainer,
  ];

  if (packIds !== undefined || scheduleIds !== undefined) {
    const hasPackIds = packIds && packIds.length > 0;
    const hasScheduleIds = scheduleIds && scheduleIds.length > 0;

    if (hasPackIds && hasScheduleIds) {
      filters.push({
        bool: {
          should: [{ terms: { pack_id: packIds } }, { terms: { schedule_id: scheduleIds } }],
          minimum_should_match: 1,
        },
      });
    } else if (hasPackIds) {
      filters.push({ terms: { pack_id: packIds } });
    } else if (hasScheduleIds) {
      filters.push({ terms: { schedule_id: scheduleIds } });
    } else {
      filters.push({ match_none: {} });
    }
  }

  if (cursor) {
    filters.push({
      range: {
        planned_schedule_time: sortDirection === 'desc' ? { lte: cursor } : { gte: cursor },
      },
    });
  }

  if (startDate || endDate) {
    const rangeFilter: Record<string, string> = {};
    if (startDate) rangeFilter.gte = startDate;
    if (endDate) rangeFilter.lte = endDate;
    filters.push({ range: { '@timestamp': rangeFilter } });
  }

  const MAX_AGG_BUCKETS = 65536;
  const aggSize = Math.min(Math.max(scheduledOffset + pageSize + 1, 10000), MAX_AGG_BUCKETS);

  return {
    body: {
      size: 0,
      query: {
        bool: {
          filter: filters,
        },
      },
      aggs: {
        scheduled_executions: {
          multi_terms: {
            terms: [{ field: 'schedule_id' }, { field: 'schedule_execution_count' }],
            size: aggSize,
            order: { planned_time: sortDirection },
          },
          aggs: {
            planned_time: { max: { field: 'planned_schedule_time' } },
            max_timestamp: { max: { field: '@timestamp' } },
            agent_count: { cardinality: { field: 'agent_id' } },
            total_rows: {
              sum: { field: 'action_response.osquery.count' },
            },
            success_count: {
              filter: {
                bool: { must_not: { exists: { field: 'error' } } },
              },
            },
            error_count: {
              filter: { exists: { field: 'error' } },
            },
          },
        },
      },
    },
  };
};
