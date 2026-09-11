/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { rangeQuery } from '@kbn/observability-plugin/server';
import type { ApmServiceTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import {
  CONTAINER_ID,
  HOST_HOSTNAME,
  HOST_NAME,
  SERVICE_NAME,
} from '../../../common/es_fields/apm';
import { environmentQuery } from '../../../common/utils/environment_query';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';

const getBucketKeysAsString = (
  buckets?: Array<{
    doc_count: number;
    key: string | number;
    key_as_string?: string | undefined;
  }>
) => buckets?.map((bucket) => bucket.key as string) || [];

export async function getServiceCorrelationFields({
  apmEventClient,
  serviceName,
  start,
  end,
  environment,
  documentType,
  rollupInterval,
}: {
  environment: string;
  serviceName: string;
  start: number;
  end: number;
  apmEventClient: APMEventClient;
  documentType: ApmServiceTransactionDocumentType;
  rollupInterval: RollupInterval;
}) {
  const response = await apmEventClient.search('get_service_host_names', {
    apm: {
      sources: [{ documentType, rollupInterval }],
    },
    track_total_hits: false,
    size: 0,
    query: {
      bool: {
        filter: [
          { term: { [SERVICE_NAME]: serviceName } },
          ...rangeQuery(start, end),
          ...environmentQuery(environment),
        ],
      },
    },
    aggs: {
      hostHostNames: {
        terms: {
          field: HOST_HOSTNAME,
          size: 500,
        },
      },
      hostNames: {
        terms: {
          field: HOST_NAME,
          size: 500,
        },
      },
      containerIds: {
        terms: {
          field: CONTAINER_ID,
          size: 500,
        },
      },
    },
  });

  const allHostNames = [
    ...getBucketKeysAsString(response.aggregations?.hostHostNames.buckets),
    ...getBucketKeysAsString(response.aggregations?.hostNames.buckets),
  ];
  const hostNames = new Set<string>(allHostNames);

  return {
    hostNames: Array.from(hostNames),
    containerIds: getBucketKeysAsString(response.aggregations?.containerIds.buckets),
  };
}
