/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useQuery } from '@kbn/react-query';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { lastValueFrom } from 'rxjs';
import type { IKibanaSearchResponse, IKibanaSearchRequest } from '@kbn/search-types';
import type {
  SearchRequest,
  SearchResponse,
  AggregationsMultiBucketAggregateBase,
  AggregationsStringRareTermsBucketKeys,
} from '@elastic/elasticsearch/lib/api/types';
import type { CspVulnerabilityFinding } from '@kbn/cloud-security-posture-common/schema/vulnerabilities/latest';
import type { CoreStart } from '@kbn/core/public';
import {
  getVulnerabilitiesAggregationCount,
  getVulnerabilitiesQuery,
} from '@kbn/cloud-security-posture-common/utils/findings_query_builders';
import type { UseCspOptions } from '@kbn/cloud-security-posture-common/types/findings';
import type { CspClientPluginStartDeps } from '../types';
import { showErrorToast } from '../..';

type LatestFindingsRequest = IKibanaSearchRequest<SearchRequest>;
type LatestFindingsResponse = IKibanaSearchResponse<
  SearchResponse<CspVulnerabilityFinding, FindingsAggs>
>;

interface FindingsAggs {
  count: AggregationsMultiBucketAggregateBase<AggregationsStringRareTermsBucketKeys>;
}

export const useVulnerabilitiesPreview = (options: UseCspOptions) => {
  const {
    data,
    notifications: { toasts },
  } = useKibana<CoreStart & CspClientPluginStartDeps>().services;

  return useQuery(
    ['csp_vulnerabilities_preview', { params: options }],
    async () => {
      const {
        rawResponse: { aggregations },
      } = await lastValueFrom(
        data.search.search<LatestFindingsRequest, LatestFindingsResponse>(
          {
            params: getVulnerabilitiesQuery(options, true) as LatestFindingsRequest['params'],
          },
          { projectRouting: '_alias:_origin' }
        )
      );

      return {
        count: getVulnerabilitiesAggregationCount(aggregations?.count?.buckets),
      };
    },
    {
      keepPreviousData: true,
      enabled: options.enabled,
      onError: (err: Error) => showErrorToast(toasts, err),
    }
  );
};
