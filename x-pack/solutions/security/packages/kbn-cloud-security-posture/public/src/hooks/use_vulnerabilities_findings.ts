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
import type {
  CspVulnerabilityFinding,
  Vulnerability,
} from '@kbn/cloud-security-posture-common/schema/vulnerabilities/latest';
import type { CoreStart } from '@kbn/core/public';
import type { UseCspOptions } from '@kbn/cloud-security-posture-common/types/findings';
import {
  getVulnerabilitiesAggregationCount,
  getVulnerabilitiesQuery,
} from '@kbn/cloud-security-posture-common/utils/findings_query_builders';
import type { CspClientPluginStartDeps } from '../types';
import { showErrorToast } from '../..';

export enum VULNERABILITY_FINDING {
  TITLE = 'vulnerability.title',
  ID = 'vulnerability.id',
  SEVERITY = 'vulnerability.severity',
  PACKAGE_NAME = 'package.name',
  PACKAGE_VERSION = 'package.version',
}

type LatestFindingsRequest = IKibanaSearchRequest<SearchRequest>;
type LatestFindingsResponse = IKibanaSearchResponse<
  SearchResponse<CspVulnerabilityFinding, FindingsAggs>
>;

export interface VulnerabilitiesPackage extends Vulnerability {
  package: {
    name: string;
    version: string;
  };
}

export interface VulnerabilitiesFindingTableDetailsFields {
  [VULNERABILITY_FINDING.TITLE]: string;
  [VULNERABILITY_FINDING.ID]: string;
  [VULNERABILITY_FINDING.SEVERITY]: string;
  [VULNERABILITY_FINDING.PACKAGE_NAME]: string;
}

export type VulnerabilitiesFindingDetailFields = Pick<Vulnerability, 'score'> &
  Pick<CspVulnerabilityFinding, 'vulnerability' | 'resource' | 'event'> &
  VulnerabilitiesFindingTableDetailsFields & { [VULNERABILITY_FINDING.PACKAGE_VERSION]: string };

interface FindingsAggs {
  count: AggregationsMultiBucketAggregateBase<AggregationsStringRareTermsBucketKeys>;
}

export const useVulnerabilitiesFindings = (options: UseCspOptions) => {
  const {
    data,
    notifications: { toasts },
  } = useKibana<CoreStart & CspClientPluginStartDeps>().services;
  /**
   * We're using useInfiniteQuery in this case to allow the user to fetch more data (if available and up to 10k)
   * useInfiniteQuery differs from useQuery because it accumulates and caches a chunk of data from the previous fetches into an array
   * it uses the getNextPageParam to know if there are more pages to load and retrieve the position of
   * the last loaded record to be used as a from parameter to fetch the next chunk of data.
   */
  return useQuery(
    ['csp_vulnerabilities_findings', { params: options }],
    async ({ pageParam }) => {
      const {
        rawResponse: { aggregations, hits },
      } = await lastValueFrom(
        data.search.search<LatestFindingsRequest, LatestFindingsResponse>(
          {
            params: getVulnerabilitiesQuery(options, pageParam) as LatestFindingsRequest['params'],
          },
          { projectRouting: '_alias:_origin' }
        )
      );

      return {
        count: getVulnerabilitiesAggregationCount(aggregations?.count?.buckets),
        rows: hits.hits.map((finding) => ({
          vulnerability: finding._source?.vulnerability,
          resource: finding._source?.resource,
          score: finding._source?.vulnerability?.score,
          [VULNERABILITY_FINDING.ID]: finding._source?.vulnerability?.id,
          [VULNERABILITY_FINDING.SEVERITY]: finding._source?.vulnerability?.severity,
          [VULNERABILITY_FINDING.PACKAGE_NAME]: finding._source?.package?.name,
          event: finding._source?.event,
          [VULNERABILITY_FINDING.PACKAGE_VERSION]: finding._source?.package?.version,
        })) as VulnerabilitiesFindingDetailFields[],
      };
    },
    {
      keepPreviousData: true,
      enabled: options.enabled,
      onError: (err: Error) => showErrorToast(toasts, err),
    }
  );
};
