/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useQuery } from '@kbn/react-query';
import { lastValueFrom } from 'rxjs';
import type { CspFinding } from '@kbn/cloud-security-posture-common';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import {
  buildMisconfigurationsFindingsQuery,
  getMisconfigurationAggregationCount,
} from '@kbn/cloud-security-posture-common/utils/findings_query_builders';
import {
  type EntityStoreEuidApi,
  useEntityStoreEuidApi,
  type EntityType,
} from '@kbn/entity-store/public';
import type { UseCspOptions } from '@kbn/cloud-security-posture-common/types/findings';
import { showErrorToast } from '../..';
import type {
  CspClientPluginStartDeps,
  LatestFindingsRequest,
  LatestFindingsResponse,
} from '../types';

import { useGetCspBenchmarkRulesStatesApi } from './use_get_benchmark_rules_state_api';

/** Try entity types in order: enriched `entity.id` first, then user / host / service identity rules. */
const EUID_FROM_DOCUMENT_ENTITY_ORDER: EntityType[] = ['generic', 'user', 'host', 'service'];

const getEuidFromFindingDocument = (
  source: unknown,
  euidApi: EntityStoreEuidApi | undefined
): string | undefined => {
  if (source === null || source === undefined || typeof source !== 'object') {
    return undefined;
  }
  for (const entityType of EUID_FROM_DOCUMENT_ENTITY_ORDER) {
    const value = euidApi?.euid.getEuidFromObject(entityType, source);
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return undefined;
};

export enum MISCONFIGURATION {
  RESULT_EVALUATION = 'result.evaluation',
  RULE_NAME = 'rule.name',
}
export interface MisconfigurationFindingTableDetailsFields {
  [MISCONFIGURATION.RESULT_EVALUATION]: string;
  [MISCONFIGURATION.RULE_NAME]: string;
}

/** Entity id from `@kbn/entity-store` `euid.getEuidFromObject` when the document has enough identity fields. */
export type MisconfigurationFindingDetailFields = Pick<CspFinding, 'rule' | 'resource'> &
  MisconfigurationFindingTableDetailsFields & {
    entityId?: string;
  };

export const useMisconfigurationFindings = (options: UseCspOptions) => {
  const {
    data,
    notifications: { toasts },
  } = useKibana<CoreStart & CspClientPluginStartDeps>().services;
  const { data: rulesStates } = useGetCspBenchmarkRulesStatesApi();
  const euidApi = useEntityStoreEuidApi();
  return useQuery(
    ['csp_misconfiguration_findings', { params: options }, rulesStates],
    async () => {
      const {
        rawResponse: { hits, aggregations },
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
        count: getMisconfigurationAggregationCount(aggregations?.count.buckets),
        rows: hits.hits.map((finding) => {
          const source = finding._source;
          return {
            rule: source?.rule,
            resource: source?.resource,
            [MISCONFIGURATION.RULE_NAME]: source?.rule?.name,
            [MISCONFIGURATION.RESULT_EVALUATION]: source?.result?.evaluation,
            entityId: getEuidFromFindingDocument(source, euidApi ?? undefined),
          };
        }),
      };
    },
    {
      enabled: options.enabled && !!rulesStates,
      keepPreviousData: true,
      onError: (err: Error) => showErrorToast(toasts, err),
    }
  );
};
