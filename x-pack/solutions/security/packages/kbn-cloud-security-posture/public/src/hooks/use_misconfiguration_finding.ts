/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useQuery } from '@kbn/react-query';
import { lastValueFrom } from 'rxjs';
import { CDR_MISCONFIGURATIONS_INDEX_PATTERN } from '@kbn/cloud-security-posture-common';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { UseCspOptions } from '@kbn/cloud-security-posture-common/types/findings';
import { buildFindingsQueryWithFilters } from '@kbn/cloud-security-posture-common/utils/findings_query_builders';
import { showErrorToast } from '../..';
import type {
  CspClientPluginStartDeps,
  LatestFindingsRequest,
  LatestFindingsResponse,
} from '../types';

export const buildGetMisconfigurationsFindingsQuery = ({ query }: UseCspOptions) => {
  return {
    index: CDR_MISCONFIGURATIONS_INDEX_PATTERN,
    size: 1,
    ignore_unavailable: true,
    query: buildFindingsQueryWithFilters(query),
  };
};

export const useMisconfigurationFinding = (options: UseCspOptions) => {
  const {
    data,
    notifications: { toasts },
  } = useKibana<CoreStart & CspClientPluginStartDeps>().services;

  return useQuery(
    ['csp_misconfiguration_findings', { params: options }],
    async () => {
      const {
        rawResponse: { hits, aggregations },
      } = await lastValueFrom(
        data.search.search<LatestFindingsRequest, LatestFindingsResponse>(
          {
            params: buildGetMisconfigurationsFindingsQuery(
              options
            ) as LatestFindingsRequest['params'],
          },
          { projectRouting: '_alias:_origin' }
        )
      );
      if (!aggregations && options.ignore_unavailable === false)
        throw new Error('expected aggregations to be defined');
      return {
        result: hits,
      };
    },
    {
      enabled: options.enabled,
      keepPreviousData: false,
      onError: (err: Error) => showErrorToast(toasts, err),
    }
  );
};
