/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ISearchRequestParams } from '@kbn/search-types';
import { AGENT_ACTIONS_RESULTS_INDEX } from '@kbn/fleet-plugin/common';
import { isEmpty } from 'lodash';
import moment from 'moment';
import {
  ACTION_RESPONSES_DATA_STREAM_INDEX,
  ACTION_RESPONSES_INDEX,
} from '../../../../../../common/constants';
import type { ActionResultsRequestOptions } from '../../../../../../common/search_strategy';
import { getQueryFilter } from '../../../../../utils/build_query';
import { buildIndexNameWithNamespace } from '../../../../../utils/build_index_name_with_namespace';
import { buildSpaceIdFilter } from '../../../../../utils/build_space_id_filter';
import { prefixIndexPatternsWithCcs } from '../../../../../utils/ccs_utils';

export const buildActionResultsQuery = ({
  actionId,
  agentIds,
  kuery,
  startDate,
  sort,
  pagination,
  componentTemplateExists,
  ccsEnabled,
  useNewDataStream,
  integrationNamespaces,
  spaceId,
}: ActionResultsRequestOptions): ISearchRequestParams => {
  let filter = `action_id: ${actionId}`;
  if (!isEmpty(kuery)) {
    filter = filter + ` AND ${kuery}`;
  }

  const timeRangeFilter: estypes.QueryDslQueryContainer[] =
    startDate && !isEmpty(startDate)
      ? [
          {
            range: {
              'event.ingested': {
                gte: startDate,
                lte: moment(startDate).clone().add(30, 'minutes').toISOString(),
              },
            },
          },
        ]
      : [];

  const agentIdsFilter: estypes.QueryDslQueryContainer[] =
    agentIds && agentIds.length > 0
      ? [
          {
            bool: {
              should: [
                { terms: { 'agent.id': agentIds } },
                { terms: { agent_id: agentIds } },
              ] as estypes.QueryDslQueryContainer[],
              minimum_should_match: 1,
            },
          },
        ]
      : [];

  const spaceIdFilter = buildSpaceIdFilter(spaceId) as estypes.QueryDslQueryContainer;

  const filterQuery: estypes.QueryDslQueryContainer[] = [
    ...timeRangeFilter,
    ...agentIdsFilter,
    getQueryFilter({ filter }),
  ];

  let baseIndex: string;
  if (useNewDataStream) {
    baseIndex = `${ACTION_RESPONSES_DATA_STREAM_INDEX}*`;
  } else if (componentTemplateExists) {
    baseIndex = `${ACTION_RESPONSES_INDEX}*`;
  } else {
    baseIndex = `${AGENT_ACTIONS_RESULTS_INDEX}*`;
  }

  let index: string;
  if (integrationNamespaces && integrationNamespaces.length > 0) {
    index = integrationNamespaces
      .map((namespace) => buildIndexNameWithNamespace(baseIndex, namespace))
      .join(',');
  } else {
    index = baseIndex;
  }

  index = prefixIndexPatternsWithCcs(index, ccsEnabled ?? false);

  return {
    allow_no_indices: true,
    index,
    ignore_unavailable: true,
    aggs: {
      aggs: {
        global: {},
        aggs: {
          responses_by_action_id: {
            filter: {
              bool: {
                must: [
                  {
                    match: {
                      action_id: actionId,
                    },
                  },
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
