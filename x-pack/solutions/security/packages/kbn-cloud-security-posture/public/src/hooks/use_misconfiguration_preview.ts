/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useQuery } from '@kbn/react-query';
import { lastValueFrom } from 'rxjs';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { UseCspOptions } from '@kbn/cloud-security-posture-common/types/findings';
import {
  buildMisconfigurationsFindingsQuery,
  getMisconfigurationAggregationCount,
} from '@kbn/cloud-security-posture-common/utils/findings_query_builders';
import { showErrorToast } from '../..';
import type {
  CspClientPluginStartDeps,
  LatestFindingsRequest,
  LatestFindingsResponse,
} from '../types';
import { useGetCspBenchmarkRulesStatesApi } from './use_get_benchmark_rules_state_api';

export const useMisconfigurationPreview = (options: UseCspOptions) => {
  const {
    data,
    notifications: { toasts },
  } = useKibana<CoreStart & CspClientPluginStartDeps>().services;
  const { data: rulesStates } = useGetCspBenchmarkRulesStatesApi();

  return useQuery(
    ['csp_misconfiguration_preview', { params: options }, rulesStates],
    async () => {
      const {
        rawResponse: { aggregations },
      } = await lastValueFrom(
        data.search.search<LatestFindingsRequest, LatestFindingsResponse>(
          {
            params: buildMisconfigurationsFindingsQuery(
              options,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              rulesStates!
            ) as LatestFindingsRequest['params'],
          },
          { projectRouting: '_alias:_origin' }
        )
      );
      if (!aggregations && options.ignore_unavailable === false)
        throw new Error('expected aggregations to be defined');
      return {
        count: getMisconfigurationAggregationCount(aggregations?.count?.buckets),
      };
    },
    {
      enabled: options.enabled && !!rulesStates,
      keepPreviousData: true,
      onError: (err: Error) => showErrorToast(toasts, err),
    }
  );
};
