/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import { of } from 'rxjs';
import { mergeMap } from 'rxjs';
import type { IScopedSearchClient } from '@kbn/data-plugin/server';
import type { estypes } from '@elastic/elasticsearch';
import { generateTablePaginationOptions } from '../../../common/utils/build_query';
import type {
  ActionResultsRequestOptions,
  ActionResultsStrategyResponse,
} from '../../../common/search_strategy';
import { Direction, OsqueryQueries } from '../../../common/search_strategy';

export const getActionResponses = (
  search: IScopedSearchClient,
  actionId: string,
  agentsCount: number,
  integrationNamespaces: string[] | undefined,
  spaceId: string
): Observable<{
  action_id: string;
  docs: number;
  failed: number;
  pending: number;
  responded: number;
  successful: number;
}> =>
  search
    .search<
      ActionResultsRequestOptions,
      ActionResultsStrategyResponse & {
        rawResponse: {
          aggregations: {
            aggs: {
              responses_by_action_id: estypes.AggregationsSingleBucketAggregateBase & {
                rows_count: estypes.AggregationsSumAggregate;
                responses: {
                  buckets: Array<{
                    key: string;
                    doc_count: number;
                  }>;
                };
              };
            };
          };
        };
      }
    >(
      {
        actionId,
        factoryQueryType: OsqueryQueries.actionResults,
        kuery: '',
        pagination: generateTablePaginationOptions(0, 1000),
        sort: {
          direction: Direction.desc,
          field: '@timestamp',
        },
        integrationNamespaces,
        spaceId,
      },
      {
        strategy: 'osquerySearchStrategy',
      }
    )
    .pipe(
      mergeMap((val) => {
        const responded =
          val.rawResponse?.aggregations?.aggs.responses_by_action_id?.doc_count ?? 0;
        const docs =
          val.rawResponse?.aggregations?.aggs.responses_by_action_id?.rows_count?.value ?? 0;
        const aggsBuckets =
          val.rawResponse?.aggregations?.aggs.responses_by_action_id?.responses.buckets;
        const successful = aggsBuckets?.find((bucket) => bucket.key === 'success')?.doc_count ?? 0;
        const failed = aggsBuckets?.find((bucket) => bucket.key === 'error')?.doc_count ?? 0;
        const pending = agentsCount - responded;

        return of({
          action_id: actionId,
          docs,
          failed,
          pending,
          responded,
          successful,
        });
      })
    );
