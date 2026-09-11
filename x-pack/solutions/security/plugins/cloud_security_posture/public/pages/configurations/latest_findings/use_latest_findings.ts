/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useInfiniteQuery } from '@kbn/react-query';
import { number } from 'io-ts';
import { lastValueFrom } from 'rxjs';
import type { IKibanaSearchResponse, IKibanaSearchRequest } from '@kbn/search-types';
import type { estypes } from '@elastic/elasticsearch';
import { buildDataTableRecord } from '@kbn/discover-utils';
import type { EsHitRecord } from '@kbn/discover-utils/types';
import { showErrorToast } from '@kbn/cloud-security-posture';
import { MAX_FINDINGS_TO_LOAD, buildMutedRulesFilter } from '@kbn/cloud-security-posture-common';
import {
  CDR_MISCONFIGURATIONS_INDEX_PATTERN,
  LATEST_FINDINGS_RETENTION_POLICY,
} from '@kbn/cloud-security-posture-common';
import type { CspFinding } from '@kbn/cloud-security-posture-common';
import type { CspBenchmarkRulesStates } from '@kbn/cloud-security-posture-common/schema/rules/latest';
import type { BaseEsQuery } from '@kbn/cloud-security-posture';
import { useGetCspBenchmarkRulesStatesApi } from '@kbn/cloud-security-posture/src/hooks/use_get_benchmark_rules_state_api';
import { getMultiFieldsSort } from '../../../../common/utils/findings_sort';
import { useKibana } from '../../../common/hooks/use_kibana';
import { getAggregationCount, getFindingsCountAggQuery } from '../utils/utils';

interface UseFindingsOptions extends BaseEsQuery {
  sort: string[][];
  enabled: boolean;
  pageSize: number;
}

type LatestFindingsRequest = IKibanaSearchRequest<estypes.SearchRequest>;
type LatestFindingsResponse = IKibanaSearchResponse<
  estypes.SearchResponse<CspFinding, FindingsAggs>
>;

interface FindingsAggs {
  count: estypes.AggregationsMultiBucketAggregateBase<estypes.AggregationsStringRareTermsBucketKeys>;
}

export const getFindingsQuery = (
  { query, sort }: UseFindingsOptions,
  rulesStates: CspBenchmarkRulesStates,
  pageParam: any
) => {
  const mutedRulesFilterQuery = buildMutedRulesFilter(rulesStates);

  return {
    index: CDR_MISCONFIGURATIONS_INDEX_PATTERN,
    sort: getMultiFieldsSort(sort),
    size: MAX_FINDINGS_TO_LOAD,
    aggs: getFindingsCountAggQuery(),
    ignore_unavailable: true,
    query: {
      ...query,
      bool: {
        ...query?.bool,
        filter: [
          ...(query?.bool?.filter ?? []),
          {
            range: {
              '@timestamp': {
                gte: `now-${LATEST_FINDINGS_RETENTION_POLICY}`,
                lte: 'now',
              },
            },
          },
        ],
        must_not: [...(query?.bool?.must_not ?? []), ...mutedRulesFilterQuery],
      },
    },
    ...(pageParam ? { from: pageParam } : {}),
  };
};

export const useLatestFindings = (options: UseFindingsOptions) => {
  const {
    data,
    notifications: { toasts },
  } = useKibana().services;
  const { data: rulesStates } = useGetCspBenchmarkRulesStatesApi();

  /**
   * We're using useInfiniteQuery in this case to allow the user to fetch more data (if available and up to 10k)
   * useInfiniteQuery differs from useQuery because it accumulates and caches a chunk of data from the previous fetches into an array
   * it uses the getNextPageParam to know if there are more pages to load and retrieve the position of
   * the last loaded record to be used as a from parameter to fetch the next chunk of data.
   */
  return useInfiniteQuery(
    [CDR_MISCONFIGURATIONS_INDEX_PATTERN, 'csp_findings', { params: options }, rulesStates],
    async ({ pageParam }) => {
      const {
        rawResponse: { hits, aggregations },
      } = await lastValueFrom(
        data.search.search<LatestFindingsRequest, LatestFindingsResponse>(
          {
            params: getFindingsQuery(
              options,
              rulesStates!,
              pageParam
            ) as LatestFindingsRequest['params'], // ruleStates always exists since it under the `enabled` dependency.
          },
          { projectRouting: '_alias:_origin' }
        )
      );
      if (!aggregations) throw new Error('expected aggregations to be an defined');
      if (!Array.isArray(aggregations.count.buckets))
        throw new Error('expected buckets to be an array');

      return {
        page: hits.hits.map((hit) => buildDataTableRecord(hit as EsHitRecord)),
        total: number.is(hits.total) ? hits.total : 0,
        count: getAggregationCount(aggregations.count.buckets),
      };
    },
    {
      enabled: options.enabled && !!rulesStates,
      keepPreviousData: true,
      onError: (err: Error) => showErrorToast(toasts, err),
      getNextPageParam: (lastPage, allPages) => {
        if (lastPage.page.length < options.pageSize) {
          return undefined;
        }
        return allPages.length * options.pageSize;
      },
    }
  );
};
