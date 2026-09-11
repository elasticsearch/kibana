/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import type { IKibanaSearchResponse } from '@kbn/search-types';
import type { GroupingQuery, RootAggregation } from '@kbn/grouping/src';
import { useQuery } from '@kbn/react-query';
import { lastValueFrom } from 'rxjs';
import { CDR_MISCONFIGURATIONS_INDEX_PATTERN } from '@kbn/cloud-security-posture-common';
import { showErrorToast } from '@kbn/cloud-security-posture';
import type { FindingsGroupingAggregation, NumberOrNull } from '@kbn/cloud-security-posture';
import { useKibana } from '../../../common/hooks/use_kibana';

export interface FindingsRootGroupingAggregation
  extends RootAggregation<FindingsGroupingAggregation> {
  failedFindings?: {
    doc_count?: NumberOrNull;
  };
  passedFindings?: {
    doc_count?: NumberOrNull;
  };
}

export const getGroupedFindingsQuery = (query: GroupingQuery) => ({
  ...query,
  index: CDR_MISCONFIGURATIONS_INDEX_PATTERN,
  ignore_unavailable: true,
  size: 0,
});

export const useGroupedFindings = ({
  query,
  enabled = true,
}: {
  query: GroupingQuery;
  enabled: boolean;
}) => {
  const {
    data,
    notifications: { toasts },
  } = useKibana().services;

  return useQuery(
    [CDR_MISCONFIGURATIONS_INDEX_PATTERN, 'csp_grouped_findings', { query }],
    async () => {
      const {
        rawResponse: { aggregations },
      } = await lastValueFrom(
        data.search.search<
          {},
          IKibanaSearchResponse<SearchResponse<{}, FindingsRootGroupingAggregation>>
        >(
          {
            params: getGroupedFindingsQuery(query),
          },
          { projectRouting: '_alias:_origin' }
        )
      );

      if (!aggregations) throw new Error('Failed to aggregate by, missing resource id');

      return aggregations;
    },
    {
      onError: (err: Error) => showErrorToast(toasts, err),
      enabled,
      // This allows the UI to keep the previous data while the new data is being fetched
      keepPreviousData: true,
    }
  );
};
