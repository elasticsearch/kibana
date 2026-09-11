/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kqlQuery, rangeQuery } from '@kbn/observability-plugin/server';
import type { ServiceNodeMetadataResponse } from '@kbn/apm-api-shared';
import type { ApmServiceTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import { HOST_NAME, CONTAINER_ID } from '../../../common/es_fields/apm';
import { NOT_AVAILABLE_LABEL } from '../../../common/i18n';
import { SERVICE_NAME, SERVICE_NODE_NAME } from '../../../common/es_fields/apm';
import { environmentQuery, serviceNodeNameQuery } from '../../../common/utils/environment_query';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';

export async function getServiceNodeMetadata({
  kuery,
  serviceName,
  serviceNodeName,
  apmEventClient,
  start,
  end,
  environment,
  documentType,
  rollupInterval,
}: {
  kuery: string;
  serviceName: string;
  serviceNodeName: string;
  apmEventClient: APMEventClient;
  start: number;
  end: number;
  environment: string;
  documentType: ApmServiceTransactionDocumentType;
  rollupInterval: RollupInterval;
}): Promise<ServiceNodeMetadataResponse> {
  const params = {
    apm: {
      sources: [
        {
          documentType,
          rollupInterval,
        },
      ],
    },
    track_total_hits: false,
    size: 0,
    query: {
      bool: {
        filter: [
          { term: { [SERVICE_NAME]: serviceName } },
          ...rangeQuery(start, end),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
          ...serviceNodeNameQuery(serviceNodeName),
        ],
      },
    },
    aggs: {
      nodes: {
        terms: {
          field: SERVICE_NODE_NAME,
        },
      },
      host: {
        terms: {
          field: HOST_NAME,
          size: 1,
        },
      },
      containerId: {
        terms: {
          field: CONTAINER_ID,
          size: 1,
        },
      },
    },
  };

  const { aggregations } = await apmEventClient.search('get_service_node_metadata', params);

  return {
    host: aggregations?.host.buckets[0]?.key || NOT_AVAILABLE_LABEL,
    containerId: aggregations?.containerId.buckets[0]?.key || NOT_AVAILABLE_LABEL,
  };
}
