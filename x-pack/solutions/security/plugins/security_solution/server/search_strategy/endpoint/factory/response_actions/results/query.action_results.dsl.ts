/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ISearchRequestParams } from '@kbn/search-types';
import type { ActionResponsesRequestOptions } from '../../../../../../common/search_strategy/endpoint/response_actions';
import { ENDPOINT_ACTION_RESPONSES_INDEX } from '../../../../../../common/endpoint/constants';
import { prefixIndexPatternsWithCcs } from '../../../../../endpoint/utils/ccs_utils';

export const buildActionResultsQuery = ({
  actionId,
  sort,
  ccsEnabled,
}: ActionResponsesRequestOptions): ISearchRequestParams => {
  const fields = [{ field: '*' }, { field: 'EndpointActions.*', include_unmapped: true }];
  const dslQuery = {
    allow_no_indices: true,
    index: prefixIndexPatternsWithCcs(ENDPOINT_ACTION_RESPONSES_INDEX, ccsEnabled ?? false),
    fields,
    _source: false,
    size: 1,
    query: {
      term: { action_id: actionId },
    },
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
                ],
              },
            },
            aggs: {
              responses: {
                terms: {
                  script: {
                    lang: 'painless',
                    source:
                      "if (doc.containsKey('error.code') && doc['error.code'].size()==0) { return 'success' } else { return 'error' }",
                  } as const,
                },
              },
            },
          },
        },
      },
    },
    sort: [
      {
        [sort.field]: {
          order: sort.order,
        },
      },
    ],
  };

  return dslQuery;
};
