/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ISearchRequestParams } from '@kbn/search-types';
import { ACTION_RESPONSES_DATA_STREAM_INDEX } from '../../../../../common/constants';
import type { ScheduledActionResultsRequestOptions } from '../../../../../common/search_strategy';
import { prefixIndexPatternsWithCcs } from '../../../../utils/ccs_utils';
import { buildSpaceIdFilter } from '../../../../utils/build_space_id_filter';

export const buildScheduledActionResultsQuery = ({
  scheduleId,
  executionCount,
  spaceId,
  sort,
  pagination,
  ccsEnabled,
}: ScheduledActionResultsRequestOptions): ISearchRequestParams => {
  // Top-level hit scoping is enforced centrally in the search strategy
  // (enforceSpaceScope). The aggregation below is a separate filter context that
  // the top-level query does not constrain, so it is scoped explicitly here.
  // Scheduled action_responses emitted by osquerybeat may not carry a `space_id`
  // field; buildSpaceIdFilter matches a missing field in the default space.
  const spaceIdFilter = buildSpaceIdFilter(spaceId);

  const filterQuery: Array<Record<string, unknown>> = [
    { term: { schedule_id: scheduleId } },
    { term: { schedule_execution_count: executionCount } },
  ];

  const index = prefixIndexPatternsWithCcs(
    `${ACTION_RESPONSES_DATA_STREAM_INDEX}*`,
    ccsEnabled ?? false
  );

  return {
    allow_no_indices: true,
    index,
    ignore_unavailable: true,
    aggs: {
      aggs: {
        global: {},
        aggs: {
          responses_by_schedule: {
            filter: {
              bool: {
                must: [
                  { term: { schedule_id: scheduleId } },
                  { term: { schedule_execution_count: executionCount } },
                  spaceIdFilter,
                ],
              },
            },
            aggs: {
              rows_count: {
                sum: {
                  field: 'action_response.osquery.count',
                },
              },
              responses: {
                terms: {
                  script: {
                    lang: 'painless',
                    source:
                      "if (doc['error.keyword'].size()==0) { return 'success' } else { return 'error' }",
                  } as const,
                },
              },
            },
          },
        },
      },
    },
    query: { bool: { filter: filterQuery } },
    from: pagination ? pagination.activePage * pagination.querySize : 0,
    size: pagination?.querySize ?? 100,
    track_total_hits: true,
    fields: ['*'],
    sort: [
      {
        [sort.field]: {
          order: sort.direction,
        },
      },
    ],
  };
};
